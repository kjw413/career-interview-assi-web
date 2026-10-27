import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createCloudStore } from './cloudStore';
import { createProject } from './tree';
import type { Project } from '../types';

function fixture() {
  let row: { id: string; data: Project; revision: number; pdf_path: string | null } | undefined;
  let failure: { message: string } | null = null;
  const remove = vi.fn(async () => ({ error: null }));
  const upload = vi.fn(async () => ({ error: null }));
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-a' } } }, error: null }) },
    rpc: vi.fn(async (_name: string, input: { project_id: string; project_data: Project; expected_revision: number; new_pdf_path: string | null }) => {
      if (failure) return { data: null, error: failure };
      if ((row?.revision ?? 0) !== input.expected_revision) return { data: null, error: { message: 'FOLIO_CONFLICT' } };
      row = { id: input.project_id, data: input.project_data, revision: (row?.revision ?? 0) + 1, pdf_path: input.new_pdf_path };
      return { data: [row], error: null };
    }),
    storage: { from: () => ({ upload, remove, download: async () => ({ data: new Blob(['pdf']), error: null }) }) },
  };
  return { store: createCloudStore(client as unknown as SupabaseClient, 'owner-a'), client, remove, upload, row: () => row!, fail: () => { failure = { message: 'FOLIO_CONFLICT' }; } };
}

describe('cloud project adapter', () => {
  it('binds a pending PDF to its extracted resume, preserving older snapshots until replacement saves', async () => {
    const f = fixture(); const project = createProject('기업', '직무');
    const first = { name: 'resume.pdf', text: 'first document', pages: 1, usedOcr: false };
    project.resume = first;
    await f.store.putResumeFile(project.id, new Blob(['first']), first);
    await f.store.saveProject(project);
    const firstPath = f.row().pdf_path;
    expect(firstPath).toMatch(new RegExp(`^owner-a/${project.id}/`));
    const second = { ...first, text: 'second document with same filename' };
    await f.store.putResumeFile(project.id, new Blob(['second']), second);
    await f.store.saveProject({ ...project, updatedAt: Date.now() });
    expect(f.row().pdf_path).toBe(firstPath);
    await f.store.saveProject({ ...project, resume: second });
    expect(f.row().pdf_path).not.toBe(firstPath);
    expect(f.remove).toHaveBeenCalledWith([firstPath]);
  });
  it('preserves the previous PDF when a revision conflict prevents its replacement', async () => {
    const f = fixture(); const project = createProject('기업', '직무');
    project.resume = { name: 'first.pdf', text: 'first', pages: 1, usedOcr: false };
    await f.store.putResumeFile(project.id, new Blob(['first']), project.resume);
    await f.store.saveProject(project);
    const previous = f.row().pdf_path;
    const next = { ...project, resume: { ...project.resume, text: 'second' } };
    await f.store.putResumeFile(project.id, new Blob(['second']), next.resume);
    f.fail();
    await expect(f.store.saveProject(next)).rejects.toThrow('다른 기기');
    expect(f.row().pdf_path).toBe(previous);
    expect(f.remove).not.toHaveBeenCalled();
  });
});
