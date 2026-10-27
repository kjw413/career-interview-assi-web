import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createNode, createProject } from './tree';
import { closeStorage, DATABASE_NAME, deleteProject, getResumeFile, listProjects, putResumeFile, saveProject } from './storage';

afterEach(async () => {
  await closeStorage();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
});

describe('local interview storage', () => {
  it('seeds a labeled example once and respects the user deleting every project', async () => {
    const initial = await listProjects();
    expect(initial).toHaveLength(1);
    expect(initial[0].isDemo).toBe(true);
    expect(initial[0].nodes.length).toBeGreaterThan(0);
    await deleteProject(initial[0].id);
    await closeStorage();
    expect(await listProjects()).toEqual([]);
  });

  it('persists resume text and recursive manual answers across database reconnection', async () => {
    await listProjects();
    const project = createProject('당근', '서비스 기획자');
    project.resume = { name: 'resume.pdf', text: '사용자 인터뷰를 진행했습니다.', pages: 1, usedOcr: true };
    const parent = createNode(null, '사용자 인터뷰');
    parent.question = '인터뷰의 목적은 무엇이었나요?';
    parent.answer = '가입 단계의 이탈 원인을 확인했습니다.';
    parent.status = 'ready';
    const child = createNode(parent.id, '이탈 원인');
    child.question = '원인을 어떻게 검증했나요?';
    project.nodes = [parent, child];
    await saveProject(project);
    await closeStorage();
    const restored = (await listProjects()).find((entry) => entry.id === project.id);
    expect(restored).toEqual(project);
  });

  it('keeps PDF files isolated and removes only the deleted application and its PDF', async () => {
    const first = createProject('A기업', '개발자');
    const second = createProject('B기업', '개발자');
    await saveProject(first);
    await saveProject(second);
    await putResumeFile(first.id, new Blob(['first-pdf'], { type: 'application/pdf' }));
    await putResumeFile(second.id, new Blob(['second-pdf'], { type: 'application/pdf' }));
    await deleteProject(first.id);
    expect(await getResumeFile(first.id)).toBeUndefined();
    expect(await (await getResumeFile(second.id))?.text()).toBe('second-pdf');
    const retained = await listProjects();
    expect(retained.map((project) => project.id)).toEqual([second.id]);
    // Existing data must prevent initialization from adding an unwanted example.
    expect(retained.some((project) => project.isDemo)).toBe(false);
  });
});
