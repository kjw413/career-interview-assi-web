import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, ResumeData } from '../types';
import type { ProjectStore } from './projectStore';
import { journalDraft, clearDraft, recoveryDrafts } from './recovery';

interface Row { id: string; data: Project; revision: number; pdf_path: string | null }
export class CloudConflictError extends Error {
  constructor() { super('다른 기기에서 이 지원서를 수정했습니다. 현재 내용을 백업한 뒤 ‘최신 내용 불러오기’를 눌러 주세요.'); this.name = 'CloudConflictError'; }
}
function failure(error: { message?: string; code?: string } | null): Error {
  if (error?.message?.includes('FOLIO_CONFLICT')) return new CloudConflictError();
  if (error?.code === 'PGRST202' || error?.code === '42P01' || error?.code === 'PGRST205') return new Error('클라우드 저장소 준비가 필요합니다. Supabase에 제공된 초기 설정 SQL을 적용해 주세요.');
  return new Error('클라우드 요청에 실패했습니다. 로그인 상태와 인터넷 연결을 확인하고 다시 시도해 주세요.');
}

export function createCloudStore(client: SupabaseClient, userId: string): ProjectStore {
  const records = new Map<string, Row>();
  const uploads = new Map<string, { path: string; resume?: ResumeData }>();
  async function assertUser() {
    const { data, error } = await client.auth.getSession();
    if (error || data.session?.user.id !== userId) throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
  }
  return {
    kind: 'cloud', ownerId: userId,
    async listProjects() {
      await assertUser();
      const { data, error } = await client.from('folio_projects').select('id,data,revision,pdf_path').eq('user_id', userId).order('updated_at', { ascending: false });
      if (error) throw failure(error);
      uploads.clear();
      records.clear();
      for (const row of (data ?? []) as Row[]) records.set(row.id, row);
      return [...records.values()].map((row) => row.data);
    },
    async saveProject(project) {
      // Keep an account-scoped recovery copy before a network write. Never replay a
      // stale recovery copy over a newer cloud revision; users export it explicitly.
      const recoveryToken = await journalDraft(userId, project).catch(() => undefined);
      await assertUser();
      const current = records.get(project.id);
      const pending = uploads.get(project.id);
      const matches = pending && (!pending.resume || (pending.resume.text === project.resume?.text && pending.resume.name === project.resume?.name));
      const pdfPath = matches ? pending.path : current?.pdf_path ?? null;
      const { data, error } = await client.rpc('save_folio_project', {
        project_id: project.id, project_data: project, expected_revision: current?.revision ?? 0, new_pdf_path: pdfPath,
      });
      if (error) throw failure(error);
      const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
      if (!row || typeof row.revision !== 'number') throw new Error('클라우드 저장 결과를 확인하지 못했습니다. 최신 내용을 확인해 주세요.');
      records.set(project.id, row);
      if (recoveryToken) await clearDraft(userId, project.id, recoveryToken).catch(() => undefined);
      if (uploads.get(project.id)?.path === pdfPath) uploads.delete(project.id);
      // Remove replaced documents only after the database references the new PDF.
      if (current?.pdf_path && current.pdf_path !== pdfPath) await client.storage.from('resumes').remove([current.pdf_path]).catch(() => undefined);
    },
    async deleteProject(id) {
      await assertUser();
      const current = records.get(id);
      if (!current) throw new CloudConflictError();
      const { data, error } = await client.from('folio_projects').delete().eq('user_id', userId).eq('id', id).eq('revision', current.revision).select('id');
      if (error) throw failure(error);
      if (!data?.length) throw new CloudConflictError();
      records.delete(id);
      const drafts = await recoveryDrafts(userId).catch(() => []);
      for (const draft of drafts.filter((item) => item.project.id === id)) await clearDraft(userId, id, draft.token).catch(() => undefined);
      const paths = [current.pdf_path, uploads.get(id)?.path].filter((path): path is string => !!path);
      uploads.delete(id);
      if (paths.length) await client.storage.from('resumes').remove(paths).catch(() => undefined);
    },
    async putResumeFile(id, file, resume) {
      await assertUser();
      const path = `${userId}/${id}/${crypto.randomUUID()}.pdf`;
      const { error } = await client.storage.from('resumes').upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (error) throw failure(error);
      const previous = uploads.get(id);
      uploads.set(id, { path, resume });
      if (previous) await client.storage.from('resumes').remove([previous.path]).catch(() => undefined);
    },
    async getResumeFile(id) {
      await assertUser();
      const path = uploads.get(id)?.path ?? records.get(id)?.pdf_path;
      if (!path) return undefined;
      const { data, error } = await client.storage.from('resumes').download(path);
      if (error) throw failure(error);
      return data ?? undefined;
    },
  };
}
