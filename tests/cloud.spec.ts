import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createDemoProject } from '../src/lib/demo';

const host = 'https://folio-cloud-test.supabase.co';
const ids = { 'a@example.com': '11111111-1111-4111-8111-111111111111', 'b@example.com': '22222222-2222-4222-8222-222222222222' };
type Row = { id: string; user_id: string; data: Record<string, unknown>; revision: number; pdf_path: string | null };
class Backend {
  rows = new Map<string, Row>();
  files = new Map<string, Buffer>();
  failSave = false;
  async install(context: BrowserContext) {
    await context.route(`${host}/**`, async (route) => {
      const request = route.request(); const url = new URL(request.url());
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version' };
      const respond = (body: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(body) });
      if (request.method() === 'OPTIONS') return respond({});
      const authorization = request.headers().authorization?.replace('Bearer ', '');
      let userId = '';
      try { userId = JSON.parse(Buffer.from(authorization!.split('.')[1], 'base64url').toString()).sub; } catch { /* anonymous request */ }
      if (url.pathname === '/auth/v1/token') {
        const body = request.postDataJSON(); const id = ids[body.email as keyof typeof ids];
        if (!id || body.password !== 'test-password') return respond({ code: 'invalid_credentials', msg: 'Invalid credentials' }, 400);
        const user = { id, email: body.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
        const payload = Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
        return respond({ access_token: `e30.${payload}.test`, refresh_token: `refresh-${id}`, expires_in: 3600, token_type: 'bearer', user });
      }
      if (url.pathname === '/auth/v1/logout') return respond({});
      if (!userId) return respond({ message: 'not authorized' }, 401);
      if (url.pathname === '/rest/v1/folio_projects') {
        if (request.method() === 'DELETE') {
          const id = url.searchParams.get('id')!.replace('eq.', '');
          const row = this.rows.get(`${userId}/${id}`);
          if (!row || String(row.revision) !== url.searchParams.get('revision')?.replace('eq.', '')) return respond([]);
          this.rows.delete(`${userId}/${id}`); return respond([{ id }]);
        }
        return respond([...this.rows.values()].filter((row) => row.user_id === userId));
      }
      if (url.pathname === '/rest/v1/rpc/save_folio_project') {
        if (this.failSave) return respond({ message: 'network unavailable' }, 503);
        const body = request.postDataJSON(); const key = `${userId}/${body.project_id}`; const current = this.rows.get(key);
        if ((current?.revision ?? 0) !== body.expected_revision) return respond({ message: 'FOLIO_CONFLICT' }, 400);
        const row = { id: body.project_id, user_id: userId, data: body.project_data, revision: (current?.revision ?? 0) + 1, pdf_path: body.new_pdf_path };
        this.rows.set(key, row); return respond([row]);
      }
      if (url.pathname.startsWith('/storage/v1/object/resumes/')) {
        const path = decodeURIComponent(url.pathname.replace('/storage/v1/object/resumes/', ''));
        if (!path.startsWith(`${userId}/`)) return respond({ message: 'denied' }, 403);
        if (request.method() === 'POST' || request.method() === 'PUT') { this.files.set(path, request.postDataBuffer()!); return respond({ Key: `resumes/${path}` }); }
        return route.fulfill({ status: this.files.has(path) ? 200 : 404, headers: { ...headers, 'content-type': 'application/pdf' }, body: this.files.get(path) ?? '' });
      }
      if (url.pathname === '/storage/v1/object/resumes' && request.method() === 'DELETE') return respond([]);
      return respond({ message: `Unhandled test endpoint ${url.pathname}` }, 404);
    });
  }
}
async function login(page: Page, email = 'a@example.com') {
  await page.goto('/');
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: '로그인', exact: true }).last().click();
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
}
async function createProject(page: Page, company: string) {
  await page.getByRole('button', { name: '새 지원서 만들기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '새 지원서 만들기' });
  await dialog.getByLabel('지원 기업', { exact: true }).fill(company);
  await dialog.getByLabel('지원 직무', { exact: true }).fill('개발자');
  await dialog.getByRole('button', { name: '지원서 만들기', exact: true }).click();
  await expect(page.getByText('모든 변경사항 저장됨', { exact: true })).toBeVisible();
}

test('requires login and never falls back to browser projects on authentication failure', async ({ page, context }) => {
  const backend = new Backend(); await backend.install(context); await page.goto('/');
  await expect(page.getByRole('heading', { name: '어디서든, 이어서 준비하세요.' })).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await page.getByLabel('이메일', { exact: true }).fill('unknown@example.com');
  await page.getByLabel('비밀번호', { exact: true }).fill('wrong');
  await page.getByRole('button', { name: '로그인', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText('이메일 또는 비밀번호');
  await expect(page.locator('.sidebar')).toHaveCount(0);
});

test('shares cloud projects across two independent browsers and isolates a second account', async ({ browser, page, context }) => {
  const backend = new Backend(); await backend.install(context); await login(page); await createProject(page, '기기 간 공유 기업');
  const laptop = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' }); await backend.install(laptop); const second = await laptop.newPage();
  await login(second); await expect(second.getByRole('navigation', { name: '지원서 목록' })).toContainText('기기 간 공유 기업');
  await second.getByRole('button', { name: '로그아웃', exact: true }).click();
  await login(second, 'b@example.com');
  await expect(second.getByRole('heading', { name: '좋은 면접은, 좋은 준비에서.' })).toBeVisible();
  await expect(second.getByRole('navigation', { name: '지원서 목록' })).not.toContainText('기기 간 공유 기업');
  await laptop.close();
});

test('saves answer styles through the editor and shares them with another browser without changing answer text', async ({ browser, page, context }) => {
  const backend = new Backend();
  const project = { ...createDemoProject(), id: 'cloud-answer-presets', company: '서식 공유 기업', isDemo: false };
  const key = `${ids['a@example.com']}/${project.id}`;
  backend.rows.set(key, { id: project.id, user_id: ids['a@example.com'], data: project as unknown as Record<string, unknown>, revision: 1, pdf_path: null });
  await backend.install(context);
  await login(page);
  await page.getByRole('tab', { name: '질문 목록', exact: true }).click();
  await page.locator('[data-question-id="demo-q1"] .list-question-open').click();

  async function selectAnswerPhrase(target: Page, phrase: string) {
    const field = target.getByRole('textbox', { name: '나의 답변', exact: true });
    await field.focus();
    await field.evaluate((element, picked) => {
      const document = element.ownerDocument;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
      const start = textNodes.map(node => node.textContent).join('').indexOf(picked);
      if (start < 0) throw new Error(`Missing answer phrase: ${picked}`);
      const range = document.createRange();
      let offset = 0;
      for (const node of textNodes) {
        const end = offset + node.length;
        if (start >= offset && start < end) range.setStart(node, start - offset);
        if (start + picked.length > offset && start + picked.length <= end) {
          range.setEnd(node, start + picked.length - offset);
          break;
        }
        offset = end;
      }
      const selection = document.getSelection()!;
      selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, phrase);
  }

  await selectAnswerPhrase(page, '사용자');
  await page.getByRole('textbox', { name: '나의 답변', exact: true }).press('Control+b');
  await page.getByRole('button', { name: '서식 저장', exact: true }).click();
  await page.getByLabel('서식 이름', { exact: true }).fill('클라우드 핵심');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await expect.poll(() => backend.rows.get(key)?.data.answerStylePresets).toEqual([
    { id: expect.any(String), name: '클라우드 핵심', bold: true },
  ]);
  await expect(page.getByText('모든 변경사항 저장됨', { exact: true })).toBeVisible();
  const savedRevision = backend.rows.get(key)!.revision;

  const laptop = await browser.newContext({ baseURL: 'http://127.0.0.1:5174' });
  try {
    await backend.install(laptop);
    const second = await laptop.newPage();
    await login(second);
    await second.getByRole('tab', { name: '질문 목록', exact: true }).click();
    await second.locator('[data-question-id="demo-q5"] .list-question-open').click();
    const field = second.getByRole('textbox', { name: '나의 답변', exact: true });
    const originalAnswer = project.nodes.find(node => node.id === 'demo-q5')!.answer;
    await expect(field).toHaveText(originalAnswer);
    const applyStyle = second.getByRole('button', { name: '저장한 서식 클라우드 핵심 적용', exact: true });
    await expect(applyStyle).toBeVisible();
    await expect(applyStyle).toBeDisabled();
    await selectAnswerPhrase(second, '각 팀');
    await expect(applyStyle).toBeEnabled();
    await applyStyle.click();
    await expect(field.locator('strong')).toHaveText('각 팀');
    await expect(field).toHaveText(originalAnswer);
    await expect.poll(() => {
      const nodes = backend.rows.get(key)?.data.nodes as Array<{ id: string; answer: string; answerFormatting?: unknown }> | undefined;
      const answer = nodes?.find(node => node.id === 'demo-q5');
      return { text: answer?.answer, formatting: answer?.answerFormatting };
    }).toEqual({ text: originalAnswer, formatting: [{ start: 0, end: 3, bold: true }] });
    await expect(second.getByText('모든 변경사항 저장됨', { exact: true })).toBeVisible();
    expect(backend.rows.get(key)!.revision).toBeGreaterThan(savedRevision);
  } finally { await laptop.close(); }
});

test('does not overwrite newer changes from another device and allows safe reload', async ({ page, context }) => {
  const backend = new Backend(); await backend.install(context); await login(page); await createProject(page, '원래 기업');
  const [key, row] = [...backend.rows.entries()][0];
  backend.rows.set(key, { ...row, revision: row.revision + 1, data: { ...row.data, company: '다른 기기에서 수정' } });
  await page.getByRole('button', { name: '지원서 관리' }).click(); await page.getByRole('button', { name: '지원 정보 수정' }).click();
  const dialog = page.getByRole('dialog', { name: '지원 정보 수정' }); await dialog.getByLabel('지원 기업', { exact: true }).fill('이 기기의 수정');
  await dialog.getByRole('button', { name: '변경 사항 저장' }).click();
  await expect(page.getByRole('status')).toContainText('다른 기기에서');
  expect(backend.rows.get(key)!.data.company).toBe('다른 기기에서 수정');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '최신 내용 불러오기', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '최신 내용 불러오기', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('미저장백업');
  await expect(page.getByRole('navigation', { name: '지원서 목록' })).toContainText('다른 기기에서 수정');
});

test('imports legacy local projects explicitly and does not duplicate them', async ({ page, context }) => {
  const backend = new Backend(); await backend.install(context); await page.goto('/');
  await page.evaluate(async () => {
    const { createDemoProject } = await import('/src/lib/demo.ts');
    const { saveProject, putResumeFile } = await import('/src/lib/storage.ts');
    const project = { ...createDemoProject(), id: 'legacy-local', company: '기존 브라우저 자료', isDemo: false };
    await saveProject(project); await putResumeFile(project.id, new Blob(['%PDF-1.4 fictional local fixture'], { type: 'application/pdf' }));
  });
  await login(page);
  await page.getByRole('button', { name: '이 브라우저의 지원서 1개 가져오기' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '가져오기', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '지원서 목록' })).toContainText('기존 브라우저 자료');
  expect(backend.rows.size).toBe(1); expect(backend.files.size).toBe(1);
  const row = [...backend.rows.values()][0];
  expect(row.pdf_path).toMatch(new RegExp(`^${ids['a@example.com']}/`));
  await page.reload();
  await page.getByRole('button', { name: '내 계정으로 가져오기' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '가져오기', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('기존 자료를 현재 계정에');
  expect(backend.rows.size).toBe(1); expect(backend.files.size).toBe(1);
});

test('retains a recovery copy after a failed save and reconnecting', async ({ page, context }) => {
  const backend = new Backend(); await backend.install(context); await login(page); backend.failSave = true;
  await createProjectWithoutWaiting(page);
  await expect(page.getByRole('button', { name: '저장 실패, 다시 시도' })).toBeVisible();
  backend.failSave = false;
  await page.reload();
  await expect(page.getByRole('button', { name: '복구 백업 내려받기' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '복구 백업 내려받기' }).click();
  expect((await download).suggestedFilename()).toContain('복구백업');
});
async function createProjectWithoutWaiting(page: Page) {
  await page.getByRole('button', { name: '새 지원서 만들기', exact: true }).click();
  const dialog = page.getByRole('dialog'); await dialog.getByLabel('지원 기업', { exact: true }).fill('미저장 기업'); await dialog.getByLabel('지원 직무', { exact: true }).fill('개발자');
  await dialog.getByRole('button', { name: '지원서 만들기', exact: true }).click();
}
