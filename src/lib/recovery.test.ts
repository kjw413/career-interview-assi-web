import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { clearDraft, journalDraft, recoveryDrafts } from './recovery';
import { createProject } from './tree';

describe('account-scoped unsaved recovery copies', () => {
  it('isolates accounts and never deletes a newer edit when an old save completes', async () => {
    const project = createProject('복구 기업', '개발자');
    const old = await journalDraft('user-a', project);
    const updated = { ...project, company: '최근 수정' };
    const current = await journalDraft('user-a', updated);
    expect(await recoveryDrafts('user-b')).toHaveLength(0);
    await clearDraft('user-a', project.id, old);
    expect((await recoveryDrafts('user-a'))[0].project.company).toBe('최근 수정');
    await clearDraft('user-a', project.id, current);
    expect(await recoveryDrafts('user-a')).toHaveLength(0);
  });
});
