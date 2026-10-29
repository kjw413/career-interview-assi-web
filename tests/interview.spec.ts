import { expect, test, type Page } from '@playwright/test';

/** Small, deterministic synthetic resume with embedded text and a valid PDF xref. */
function resumePdf(): Buffer {
  const content = 'BT /F1 16 Tf 50 740 Td (Alex Kim) Tj 0 -26 Td (Frontend Developer) Tj 0 -30 Td /F1 11 Tf (React and TypeScript development experience) Tj 0 -22 Td (Improved onboarding with user research and A/B testing.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const editor = (page: Page) => page.getByRole('complementary', { name: '질문 편집', exact: true });

async function saved(page: Page) {
  await expect(page.getByText('모든 변경사항 저장됨', { exact: true })).toBeVisible();
}

async function createApplication(page: Page, company: string, role: string) {
  await page.getByRole('button', { name: '새 지원서 만들기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '새 지원서 만들기' });
  await dialog.getByLabel('지원 기업', { exact: true }).fill(company);
  await dialog.getByLabel('지원 직무', { exact: true }).fill(role);
  await dialog.getByRole('button', { name: '지원서 만들기', exact: true }).click();
  await expect(dialog).toBeHidden();
  await saved(page);
}

async function uploadResume(page: Page) {
  await page.getByLabel('이력서 PDF 파일', { exact: true }).setInputFiles({ name: 'alex-resume.pdf', mimeType: 'application/pdf', buffer: resumePdf() });
  await expect(page.getByLabel('이력서 텍스트. 문구를 선택하면 질문을 추가할 수 있습니다.')).toContainText('Alex Kim');
  await saved(page);
}

async function questionList(page: Page) {
  await page.getByRole('tab', { name: '질문 목록', exact: true }).click();
}

async function openQuestion(page: Page, question: string) {
  await questionList(page);
  await page.locator('.question-list-item').filter({ has: page.getByText(question, { exact: true }) }).click();
  await expect(editor(page)).toBeVisible();
}

/** Uses browser text selection and its native mouse-up event; no app state is injected. */
async function selectResumeText(page: Page, text: string) {
  const document = page.getByLabel('이력서 텍스트. 문구를 선택하면 질문을 추가할 수 있습니다.');
  await document.evaluate((element, phrase) => {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let current: Node | null;
    while ((current = walker.nextNode())) {
      const index = current.textContent?.indexOf(phrase) ?? -1;
      if (index < 0) continue;
      const range = element.ownerDocument.createRange();
      range.setStart(current, index);
      range.setEnd(current, index + phrase.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return;
    }
    throw new Error(`Missing resume phrase: ${phrase}`);
  }, text);
  await page.getByRole('button', { name: `“${text}”에서 질문 추가`, exact: true }).click();
}

/** Selects a phrase across formatting spans using the browser's native DOM selection. */
async function selectRichText(page: Page, label: '나의 답변' | '예상 질문', text: string) {
  const field = editor(page).getByLabel(label, { exact: true });
  await field.focus();
  await field.evaluate((element, phrase) => {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const parts: { node: Node; start: number; end: number }[] = [];
    let content = '';
    let current: Node | null;
    while ((current = walker.nextNode())) {
      const part = current.textContent ?? '';
      parts.push({ node: current, start: content.length, end: content.length + part.length });
      content += part;
    }
    const start = content.indexOf(phrase);
    if (start < 0) throw new Error(`Missing editor phrase: ${phrase}`);
    const end = start + phrase.length;
    const first = parts.find(part => part.end > start)!;
    const last = parts.find(part => part.end >= end)!;
    const range = element.ownerDocument.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    const selection = element.ownerDocument.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    element.ownerDocument.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  }, text);
  if (label === '나의 답변') {
    await expect(page.getByRole('button', { name: `“${text}”에서 꼬리질문 추가`, exact: true })).toBeVisible();
  }
}

async function selectAnswerText(page: Page, text: string) {
  await selectRichText(page, '나의 답변', text);
  await page.getByRole('button', { name: `“${text}”에서 꼬리질문 추가`, exact: true }).click();
}

async function fillQuestion(page: Page, question: string, answer: string) {
  await editor(page).getByLabel('예상 질문', { exact: true }).fill(question);
  await editor(page).getByLabel('나의 답변', { exact: true }).fill(answer);
  await saved(page);
}

async function closeEditor(page: Page) {
  await page.getByRole('button', { name: '질문 편집 닫기', exact: true }).click();
}

async function downloadBackup(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 내보내기', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('샘플 지원서', { exact: true })).toBeVisible();
});

test('starts with an explicit fictional sample, six linked questions and functional views', async ({ page }) => {
  await expect(page.getByLabel('면접 질문 마인드맵')).toBeVisible();
  await expect(page.locator('.react-flow__node-question')).toHaveCount(6);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await expect(page.locator('.map-interviewer')).toHaveCount(0);
  await expect(page.getByText('가상의 예시 이력서', { exact: true })).toBeVisible();
  await questionList(page);
  await expect(page.locator('.question-list-item')).toHaveCount(6);
  await page.getByLabel('준비 상태 필터', { exact: true }).selectOption('draft');
  await expect(page.locator('.question-list-item')).toHaveCount(2);
  await page.getByLabel('준비 상태 필터', { exact: true }).selectOption('all');
  await page.getByLabel('질문 검색', { exact: true }).fill('바이브');
  await expect(page.locator('.question-list-item')).toHaveCount(1);
});

test('keeps newly created applications, uploaded resumes and questions isolated when switching', async ({ page }) => {
  await createApplication(page, '테스트기업', '프로덕트 디자이너');
  await expect(page.getByRole('heading', { name: '이력서에서 시작하세요', exact: true })).toBeVisible();
  await uploadResume(page);
  await selectResumeText(page, 'React');
  await expect(editor(page).getByLabel('연결된 키워드', { exact: true })).toHaveValue('React');
  await fillQuestion(page, 'React 프로젝트에서 맡은 역할은?', '디자인 시스템을 개발했습니다.');
  await closeEditor(page);
  await questionList(page);
  await expect(page.locator('.question-list-item')).toHaveCount(1);
  await page.getByRole('navigation', { name: '지원서 목록' }).getByRole('button').filter({ hasText: '토스' }).click();
  await expect(page.locator('.resume-document')).toContainText('김지원');
  await questionList(page);
  await expect(page.locator('.question-list-item')).toHaveCount(6);
  await page.getByRole('navigation', { name: '지원서 목록' }).getByRole('button').filter({ hasText: '테스트기업' }).click();
  await expect(page.locator('.resume-document')).toContainText('Alex Kim');
  await questionList(page);
  await expect(page.locator('.question-list-item')).toHaveCount(1);
  await expect(page.locator('.question-list-item')).toContainText('React 프로젝트에서 맡은 역할은?');
});

test('autosaves edits across reload and requires question plus answer for completion', async ({ page }) => {
  await page.getByRole('button', { name: '질문 추가', exact: true }).click();
  const completion = editor(page).getByRole('checkbox');
  await expect(completion).toBeDisabled();
  await expect(editor(page).getByText('면접관의 관점', { exact: true })).toHaveCount(0);
  await editor(page).getByLabel('예상 질문', { exact: true }).fill('새 질문이 저장되나요?');
  await expect(completion).toBeDisabled();
  await editor(page).getByLabel('나의 답변', { exact: true }).fill('브라우저에 작성한 내용을 보관합니다.');
  await expect(completion).toBeEnabled();
  await completion.check();
  await saved(page);
  await page.reload();
  await openQuestion(page, '새 질문이 저장되나요?');
  await expect(editor(page).getByLabel('나의 답변', { exact: true })).toHaveText('브라우저에 작성한 내용을 보관합니다.');
  await expect(editor(page).getByRole('checkbox')).toBeChecked();
  await editor(page).getByLabel('나의 답변', { exact: true }).fill('');
  await expect(editor(page).getByRole('checkbox')).not.toBeChecked();
  await expect(editor(page).getByRole('checkbox')).toBeDisabled();
});

test('branches from selected answer keywords repeatedly and deletes only the selected subtree', async ({ page }) => {
  await openQuestion(page, '바이브 코딩으로 실제 문제를 해결한 경험을 이야기해 주세요.');
  await fillQuestion(page, '바이브 코딩으로 해결한 문제는?', '반복 업무 자동화로 매주 두 시간을 절약했습니다.');
  await selectAnswerText(page, '반복 업무 자동화');
  await expect(editor(page).getByLabel('연결된 키워드', { exact: true })).toHaveValue('반복 업무 자동화');
  await fillQuestion(page, '자동화 효과를 어떻게 측정했나요?', '실행 로그를 비교하여 처리 시간을 확인했습니다.');
  await selectAnswerText(page, '실행 로그');
  await expect(editor(page).getByLabel('연결된 키워드', { exact: true })).toHaveValue('실행 로그');
  await fillQuestion(page, '로그에서 어떤 항목을 비교했나요?', '작업 시작과 완료 시각을 비교했습니다.');
  await closeEditor(page);
  await questionList(page);
  await expect(page.locator('.question-list-item')).toHaveCount(8);
  await openQuestion(page, '자동화 효과를 어떻게 측정했나요?');
  await page.getByRole('button', { name: '질문과 하위 질문 삭제', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '이 질문을 삭제할까요?', exact: true });
  await expect(confirm).toContainText('꼬리질문 1개');
  await confirm.getByRole('button', { name: '질문 삭제', exact: true }).click();
  await expect(page.locator('.question-list-item')).toHaveCount(6);
  await expect(page.locator('.question-list-item').filter({ hasText: '바이브 코딩으로 해결한 문제는?' })).toHaveCount(1);
  await expect(page.locator('.question-list-item').filter({ hasText: '디자인 시스템을 구축하며 팀과 어떻게 협업했나요?' })).toHaveCount(1);
  await expect(page.locator('.question-list-item').filter({ hasText: '로그에서 어떤 항목을 비교했나요?' })).toHaveCount(0);
});

test('exports and imports a complete backup as an independent application', async ({ page }) => {
  const text = await downloadBackup(page);
  const exported = JSON.parse(text);
  expect(exported.schemaVersion).toBe(1);
  expect(exported.project.nodes).toHaveLength(6);
  await page.getByLabel('면접 백업 파일', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...exported, project: { ...exported.project, nodes: exported.project.nodes.map((node: Record<string, unknown>) => ({ ...node, interviewer: '실무진' })) } })) });
  await expect(page.getByRole('navigation', { name: '지원서 목록' }).getByRole('button')).toHaveCount(2);
  await expect(page.getByText('백업을 새로운 지원서로 불러왔습니다.', { exact: true })).toBeVisible();
  await questionList(page);
  await expect(page.locator('.question-list-item')).toHaveCount(6);
  await saved(page);
  const restored = JSON.parse(await downloadBackup(page));
  expect(restored.project.nodes.every((node: Record<string, unknown>) => !('interviewer' in node))).toBe(true);
  expect(restored.project.id).not.toBe(exported.project.id);
  expect(restored.project.resume).toEqual(exported.project.resume);
  expect(restored.project.nodes.map((node: { question: string }) => node.question)).toEqual(exported.project.nodes.map((node: { question: string }) => node.question));
});

test('shows an actionable error for invalid backup JSON and retains existing work', async ({ page }) => {
  await page.getByLabel('면접 백업 파일', { exact: true }).setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{invalid') });
  await expect(page.getByRole('status')).toContainText('올바른 JSON 백업 파일');
  await expect(page.getByRole('navigation', { name: '지원서 목록' }).getByRole('button')).toHaveCount(1);
  await questionList(page);
  await expect(page.locator('.question-list-item')).toHaveCount(6);
});

test('fits a small mobile viewport and keeps question editing usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: '지원서 메뉴 열기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이력서 패널 접기', exact: true }).click();
  await openQuestion(page, '온보딩에서 어떤 문제를 발견했고, 어떻게 개선했나요?');
  await expect(editor(page)).toBeVisible();
  await editor(page).getByLabel('예상 질문', { exact: true }).fill('모바일에서도 질문을 작성할 수 있나요?');
  await saved(page);
  await expect(editor(page).getByLabel('예상 질문', { exact: true })).toHaveValue('모바일에서도 질문을 작성할 수 있나요?');
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  expect(widths.root).toBeLessThanOrEqual(widths.viewport);
  await page.getByRole('button', { name: '질문 편집 닫기', exact: true }).click();
  await expect(editor(page)).toBeHidden();
});

test('expands the workspace and edits map questions in a large centered popup without losing changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const workspace = page.getByRole('region', { name: '면접 준비 작업 영역' });
  const original = await workspace.boundingBox();
  await page.getByRole('button', { name: '작업 영역 전체화면', exact: true }).click();
  const restore = page.getByRole('button', { name: '작업 영역 전체화면 종료', exact: true });
  await expect(restore).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('navigation', { name: '지원서 목록' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '흩어진 경험을, 단단한 답변으로.' })).toBeHidden();
  const expanded = await workspace.boundingBox();
  const main = await page.getByRole('main').boundingBox();
  expect(expanded!.x).toBeCloseTo(main!.x, 0);
  expect(expanded!.y).toBe(0);
  expect(expanded!.width).toBeCloseTo(main!.width, 0);
  expect(expanded!.height).toBe(900);
  expect(expanded!.height).toBeGreaterThan(original!.height);
  await page.getByRole('button', { name: '마인드맵 전체 보기', exact: true }).click();
  await page.getByRole('button', { name: '온보딩에서 어떤 문제를 발견했고, 어떻게 개선했나요?', exact: true }).click();
  const popup = page.getByRole('dialog', { name: '질문 크게 편집', exact: true });
  await expect(popup).toBeVisible();
  const bounds = await popup.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(1000);
  expect(bounds!.height).toBeGreaterThanOrEqual(750);
  expect(bounds!.x + bounds!.width / 2).toBeCloseTo(720, 0);
  expect((await popup.getByLabel('나의 답변', { exact: true }).boundingBox())!.width).toBeGreaterThan(400);
  await fillQuestion(page, '전체화면에서 다듬은 질문', '큰 팝업에서 작성한 답변도 자동 저장됩니다.');
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(restore).toBeVisible();
  await restore.click();
  await expect(page.getByRole('heading', { name: '흩어진 경험을, 단단한 답변으로.' })).toBeVisible();
  await openQuestion(page, '전체화면에서 다듬은 질문');
  await expect(editor(page).getByLabel('나의 답변', { exact: true })).toHaveText('큰 팝업에서 작성한 답변도 자동 저장됩니다.');
  await expect(page.getByRole('dialog', { name: '질문 크게 편집' })).toHaveCount(0);
});

test('uses the popup for list cards, keeps follow-up editing open and closes nested dialogs in order', async ({ page }) => {
  await openQuestion(page, '바이브 코딩으로 실제 문제를 해결한 경험을 이야기해 주세요.');
  await fillQuestion(page, '작성 중인 질문', '자동화 경험을 설명합니다.');
  await page.getByRole('button', { name: '작업 영역 전체화면', exact: true }).click();
  const popup = page.getByRole('dialog', { name: '질문 크게 편집', exact: true });
  await expect(popup.getByLabel('나의 답변', { exact: true })).toHaveText('자동화 경험을 설명합니다.');
  await page.keyboard.press('Escape');
  await page.locator('.question-list-item').filter({ hasText: '작성 중인 질문' }).click();
  await expect(popup).toBeVisible();
  await selectAnswerText(page, '자동화 경험');
  await expect(popup).toBeVisible();
  await expect(popup.getByLabel('연결된 키워드', { exact: true })).toHaveValue('자동화 경험');
  await fillQuestion(page, '팝업에서 이어진 꼬리질문', '측정한 결과를 설명합니다.');
  await popup.getByRole('button', { name: '질문과 하위 질문 삭제', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: '이 질문을 삭제할까요?', exact: true });
  await expect(confirm).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirm).toBeHidden();
  await expect(popup).toBeVisible();
  await expect(popup.getByLabel('예상 질문', { exact: true })).toHaveValue('팝업에서 이어진 꼬리질문');
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(page.getByRole('button', { name: '작업 영역 전체화면 종료', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '작업 영역 전체화면', exact: true })).toBeVisible();
});

test('keeps expanded workspace and popup usable on a small mobile screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '작업 영역 전체화면', exact: true }).click();
  await questionList(page);
  await page.locator('.question-list-item').first().click();
  const popup = page.getByRole('dialog', { name: '질문 크게 편집', exact: true });
  await expect(popup).toBeVisible();
  const bounds = await popup.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await popup.getByLabel('나의 답변', { exact: true }).fill('모바일 전체화면에서 작성한 답변');
  await saved(page);
  await popup.getByRole('button', { name: '질문 편집 닫기', exact: true }).click();
  await expect(popup).toBeHidden();
  const workspace = page.getByRole('region', { name: '면접 준비 작업 영역' });
  expect((await workspace.boundingBox())!.height).toBe(844);
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: '작업 영역 전체화면 종료', exact: true }).click();
});

test('groups connected questions with stable numbers through filters and places later follow-ups under their parent', async ({ page }) => {
  await questionList(page);
  const numbers = page.locator('.question-list-item .list-number');
  await expect(numbers).toHaveText(['1-1', '1-2', '1-3', '1-4', '2-1', '3-1']);
  await expect(page.locator('.question-list-item').filter({ hasText: '테스트 결과에 영향을 줄 수 있는 변수' }).locator('.list-question-path')).toHaveAttribute('aria-label', '연결 흐름 1-3 → 1-4');
  await page.getByLabel('준비 상태 필터', { exact: true }).selectOption('draft');
  await expect(numbers).toHaveText(['1-4', '3-1']);
  await page.getByLabel('질문 검색', { exact: true }).fill('테스트 결과');
  await expect(numbers).toHaveText(['1-4']);
  await page.getByLabel('준비 상태 필터', { exact: true }).selectOption('all');
  await page.getByLabel('질문 검색', { exact: true }).fill('');

  await openQuestion(page, '사용자 인터뷰는 어떤 방식으로 진행했나요?');
  await selectAnswerText(page, '8명');
  await fillQuestion(page, '인터뷰 인원은 어떻게 결정했나요?', '실제로 가입을 중단한 사용자를 모집했습니다.');
  await closeEditor(page);
  await expect(numbers).toHaveText(['1-1', '1-2', '1-3', '1-4', '1-5', '2-1', '3-1']);
  const cards = page.locator('.question-list-item');
  await expect(cards.nth(2)).toContainText('인터뷰 인원은 어떻게 결정했나요?');
  await expect(cards.nth(2).locator('.list-question-path')).toHaveAttribute('aria-label', '연결 흐름 1-2 → 1-3');
  await expect(cards.nth(3)).toContainText('어떤 지표로 개선 효과를 검증했나요?');
});

test('navigates parent and sibling branches from filtered questions and preserves edits made immediately before moving', async ({ page }) => {
  await questionList(page);
  await page.getByLabel('준비 상태 필터', { exact: true }).selectOption('draft');
  await page.getByLabel('질문 검색', { exact: true }).fill('테스트 결과');
  await page.locator('.question-list-item').click();
  const navigation = () => editor(page).getByRole('navigation', { name: '연결된 질문', exact: true });
  await navigation().getByRole('button', { name: '부모 질문 1-3: 어떤 지표로 개선 효과를 검증했나요?', exact: true }).click();
  await expect(page.getByLabel('질문 검색', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('준비 상태 필터', { exact: true })).toHaveValue('all');
  await expect(editor(page).locator('.editor-question-label')).toHaveText('1-3');
  await editor(page).getByLabel('나의 답변', { exact: true }).fill('질문 사이를 이동하기 직전에 수정한 답변입니다.');
  await navigation().getByRole('button', { name: /^꼬리질문 1-4:/ }).click();
  await expect(editor(page).getByLabel('예상 질문', { exact: true })).toHaveValue('테스트 결과에 영향을 줄 수 있는 변수는 어떻게 통제했나요?');
  await navigation().getByRole('button', { name: /^부모 질문 1-3:/ }).click();
  await expect(editor(page).getByLabel('나의 답변', { exact: true })).toHaveText('질문 사이를 이동하기 직전에 수정한 답변입니다.');
  await navigation().getByRole('button', { name: /^부모 질문 1-1:/ }).click();
  await expect(navigation().getByRole('button', { name: /^부모 질문/ })).toHaveCount(0);
  await expect(navigation().getByRole('button', { name: /^꼬리질문/ })).toHaveCount(2);
  await navigation().getByRole('button', { name: /^꼬리질문 1-2:/ }).click();
  await expect(editor(page).getByLabel('예상 질문', { exact: true })).toHaveValue('사용자 인터뷰는 어떤 방식으로 진행했나요?');
  await navigation().getByRole('button', { name: /^부모 질문 1-1:/ }).click();
  await navigation().getByRole('button', { name: /^꼬리질문 1-3:/ }).click();
  await saved(page);
  await page.reload();
  await openQuestion(page, '어떤 지표로 개선 효과를 검증했나요?');
  await expect(editor(page).getByLabel('나의 답변', { exact: true })).toHaveText('질문 사이를 이동하기 직전에 수정한 답변입니다.');
});

test('keeps the expanded popup open while navigating linked questions on desktop and mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '작업 영역 전체화면', exact: true }).click();
  await questionList(page);
  await page.locator('.question-list-item').first().click();
  const popup = page.getByRole('dialog', { name: '질문 크게 편집', exact: true });
  const navigation = () => popup.getByRole('navigation', { name: '연결된 질문', exact: true });
  await navigation().getByRole('button', { name: /^꼬리질문 1-3:/ }).click();
  await expect(popup).toBeVisible();
  await expect(popup.locator('.editor-question-label')).toHaveText('1-3');
  await navigation().getByRole('button', { name: /^꼬리질문 1-4:/ }).click();
  await expect(popup).toBeVisible();
  await expect(popup.getByLabel('예상 질문', { exact: true })).toHaveValue('테스트 결과에 영향을 줄 수 있는 변수는 어떻게 통제했나요?');
  await page.setViewportSize({ width: 390, height: 844 });
  const parent = navigation().getByRole('button', { name: /^부모 질문 1-3:/ });
  await expect(parent).toBeVisible();
  const bounds = await parent.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  await parent.click();
  await expect(popup).toBeVisible();
  await expect(popup.locator('.editor-question-label')).toHaveText('1-3');
  await navigation().getByRole('button', { name: /^부모 질문 1-1:/ }).click();
  await expect(popup.locator('.editor-question-label')).toHaveText('1-1');
  await expect(navigation().getByRole('button', { name: /^꼬리질문/ })).toHaveCount(2);
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(page.getByRole('button', { name: '작업 영역 전체화면 종료', exact: true })).toBeVisible();
});

test('drags whole question groups by their number while preserving every linked question and answer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const before = JSON.parse(await downloadBackup(page)).project.nodes as Array<{ id: string }>;
  await page.getByRole('button', { name: '작업 영역 전체화면', exact: true }).click();
  await questionList(page);
  const source = page.getByRole('button', { name: '질문 묶음 3 순서 변경', exact: true });
  const target = page.getByRole('button', { name: '질문 묶음 2 순서 변경', exact: true });
  await source.scrollIntoViewIfNeeded();
  const sourceBounds = await source.boundingBox();
  const targetBounds = await target.boundingBox();
  expect(sourceBounds).not.toBeNull();
  expect(targetBounds).not.toBeNull();
  await page.mouse.move(sourceBounds!.x + sourceBounds!.width / 2, sourceBounds!.y + sourceBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBounds!.x + sourceBounds!.width / 2, sourceBounds!.y + sourceBounds!.height / 2 - 10, { steps: 3 });
  await page.mouse.move(targetBounds!.x + targetBounds!.width / 2, targetBounds!.y + targetBounds!.height / 2, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => page.locator('.question-list-group').evaluateAll((groups) => groups.map((group) => group.getAttribute('data-question-group'))))
    .toEqual(['demo-q1', 'demo-q6', 'demo-q5']);
  await expect(page.locator('.question-list-item .list-number')).toHaveText(['1-1', '1-2', '1-3', '1-4', '2-1', '3-1']);
  await saved(page);
  await page.getByRole('button', { name: '작업 영역 전체화면 종료', exact: true }).click();
  const after = JSON.parse(await downloadBackup(page)).project.nodes as Array<{ id: string }>;
  expect(after.map((node) => node.id)).toEqual(['demo-q1', 'demo-q2', 'demo-q3', 'demo-q4', 'demo-q6', 'demo-q5']);
  expect([...after].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...before].sort((a, b) => a.id.localeCompare(b.id)));
  await expect(editor(page)).toHaveCount(0);
});

test('reorders a root and all descendants with the keyboard and persists the new group order', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '작업 영역 전체화면', exact: true }).click();
  await questionList(page);
  await page.getByRole('button', { name: '질문 묶음 1 순서 변경', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  const cardIds = () => page.locator('.question-list-item').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-question-id')));
  await expect.poll(cardIds).toEqual(['demo-q5', 'demo-q1', 'demo-q2', 'demo-q3', 'demo-q4', 'demo-q6']);
  await expect(page.locator('.question-list-item .list-number')).toHaveText(['1-1', '2-1', '2-2', '2-3', '2-4', '3-1']);
  await saved(page);
  await page.reload();
  await questionList(page);
  await expect.poll(cardIds).toEqual(['demo-q5', 'demo-q1', 'demo-q2', 'demo-q3', 'demo-q4', 'demo-q6']);
  await page.locator('[data-question-id="demo-q4"]').click();
  await expect(editor(page).getByRole('button', { name: '부모 질문 2-3: 어떤 지표로 개선 효과를 검증했나요?', exact: true })).toBeVisible();
});

test('locks ordering inside connected flows, cancels a drag and disables reordering while filtered', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '작업 영역 전체화면', exact: true }).click();
  await questionList(page);
  await expect(page.getByRole('button', { name: /^질문 묶음 \d+ 순서 변경$/ })).toHaveCount(3);
  for (const id of ['demo-q2', 'demo-q3', 'demo-q4']) {
    await expect(page.locator(`[data-question-id="${id}"]`).getByRole('button', { name: /순서 변경/ })).toHaveCount(0);
  }
  await page.getByRole('button', { name: '질문 묶음 2 순서 변경', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '작업 영역 전체화면 종료', exact: true })).toBeVisible();
  await expect.poll(() => page.locator('.question-list-group').evaluateAll((groups) => groups.map((group) => group.getAttribute('data-question-group'))))
    .toEqual(['demo-q1', 'demo-q5', 'demo-q6']);
  await page.getByLabel('질문 검색', { exact: true }).fill('디자인 시스템');
  await expect(page.getByRole('button', { name: '질문 묶음 2 순서 변경', exact: true })).toBeDisabled();
  await expect(page.getByText('검색·상태 필터를 해제하면 순서를 바꿀 수 있어요.', { exact: true })).toBeVisible();
  await page.getByLabel('질문 검색', { exact: true }).fill('');
  await page.getByLabel('준비 상태 필터', { exact: true }).selectOption('ready');
  await expect(page.getByRole('button', { name: '질문 묶음 1 순서 변경', exact: true })).toBeDisabled();
  await page.getByLabel('준비 상태 필터', { exact: true }).selectOption('all');
  await expect(page.getByRole('button', { name: '질문 묶음 1 순서 변경', exact: true })).toBeEnabled();
});

test('keeps keyword emphasis across reload and backups while search, counts and follow-up selection stay plain text', async ({ page }) => {
  const question = '핵심 키워드로 경험을 정리해 볼까요?';
  const answer = '핵심 키워드로 경험을 설명합니다.';
  await openQuestion(page, '바이브 코딩으로 실제 문제를 해결한 경험을 이야기해 주세요.');
  await fillQuestion(page, question, answer);
  const field = () => editor(page).getByLabel('나의 답변', { exact: true });
  const toolbar = () => editor(page).getByRole('toolbar', { name: '나의 답변 서식', exact: true });
  await selectRichText(page, '나의 답변', '핵심 키워드');
  await toolbar().getByRole('button', { name: '굵게', exact: true }).click();
  await toolbar().getByRole('button', { name: '글자색', exact: true }).click();
  await toolbar().getByRole('button', { name: '글자색 빨강', exact: true }).click();
  await toolbar().getByRole('button', { name: '배경색', exact: true }).click();
  await toolbar().getByRole('button', { name: '배경색 노랑', exact: true }).click();
  await expect(field().locator('strong')).toHaveText('핵심 키워드');
  const highlighted = () => field().locator('span[style*="background-color"]');
  await expect(highlighted()).toHaveText('핵심 키워드');
  await expect(highlighted()).toHaveCSS('color', 'rgb(180, 35, 24)');
  await expect(highlighted()).toHaveCSS('background-color', 'rgb(255, 241, 168)');
  await expect(editor(page).locator('#editor-answer-count')).toContainText('공백 포함 18자');
  await expect(editor(page).locator('#editor-answer-count')).toContainText('공백 제외 15자');
  await saved(page);
  await closeEditor(page);
  await page.getByLabel('질문 검색', { exact: true }).fill('키워드로 경험');
  await expect(page.locator('.question-list-item')).toHaveCount(1);
  await expect(page.locator('.list-answer-preview')).toHaveText(answer);
  await expect(page.locator('.list-answer-preview span[style*="background-color"]')).toHaveText('핵심 키워드');
  await page.getByLabel('질문 검색', { exact: true }).fill('');
  await page.reload();
  await openQuestion(page, question);
  await expect(field()).toHaveText(answer);
  await expect(field().locator('strong')).toHaveText('핵심 키워드');
  await expect(highlighted()).toHaveCSS('background-color', 'rgb(255, 241, 168)');
  const backup = await downloadBackup(page);
  const original = JSON.parse(backup).project.nodes.find((node: { question: string }) => node.question === question);
  expect(original.answer).toBe(answer);
  expect(original.answerFormatting).toEqual([{ start: 0, end: 6, bold: true, color: '#b42318', backgroundColor: '#fff1a8' }]);
  await page.getByLabel('면접 백업 파일', { exact: true }).setInputFiles({ name: 'formatted-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect(page.getByRole('navigation', { name: '지원서 목록' }).getByRole('button')).toHaveCount(2);
  await openQuestion(page, question);
  await expect(field().locator('strong')).toHaveText('핵심 키워드');
  await expect(highlighted()).toHaveCSS('color', 'rgb(180, 35, 24)');
  // This phrase spans the formatted keyword and the unformatted text after it.
  await selectAnswerText(page, '핵심 키워드로 경험');
  await expect(editor(page).getByLabel('연결된 키워드', { exact: true })).toHaveValue('핵심 키워드로 경험');
  await expect(field()).toHaveText('');
  await editor(page).getByRole('button', { name: /^부모 질문/ }).click();
  await expect(field()).toHaveText(answer);
  await expect(highlighted()).toHaveCSS('background-color', 'rgb(255, 241, 168)');
});

test('clears selected keyword formatting and can undo the change in the large editor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openQuestion(page, '바이브 코딩으로 실제 문제를 해결한 경험을 이야기해 주세요.');
  await fillQuestion(page, '키워드를 어떻게 암기할까요?', '키워드 암기 연습');
  await page.getByRole('button', { name: '작업 영역 전체화면', exact: true }).click();
  const popup = page.getByRole('dialog', { name: '질문 크게 편집', exact: true });
  const field = popup.getByLabel('나의 답변', { exact: true });
  const toolbar = popup.getByRole('toolbar', { name: '나의 답변 서식', exact: true });
  await selectRichText(page, '나의 답변', '키워드');
  await field.press('Control+b');
  await expect(field.locator('strong')).toHaveText('키워드');
  // Let the editor's undo history separate formatting from the subsequent clear action.
  await page.waitForTimeout(600);
  await toolbar.getByRole('button', { name: '서식 지우기', exact: true }).click();
  await expect(field.locator('strong')).toHaveCount(0);
  await expect(field).toHaveText('키워드 암기 연습');
  await field.press('Control+z');
  await expect(field.locator('strong')).toHaveText('키워드');
  await expect(field).toHaveText('키워드 암기 연습');
  await saved(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toolbar.getByRole('button', { name: '굵게', exact: true })).toBeVisible();
  await toolbar.getByRole('button', { name: '배경색', exact: true }).click();
  await toolbar.getByRole('button', { name: '배경색 노랑', exact: true }).click();
  await expect(field.locator('span[style*="background-color"]')).toHaveText('키워드');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('keeps questions plain and pastes answer text without importing HTML or extra paragraph breaks', async ({ page }) => {
  await openQuestion(page, '바이브 코딩으로 실제 문제를 해결한 경험을 이야기해 주세요.');
  await fillQuestion(page, '앞뒤', '');
  const question = editor(page).getByLabel('예상 질문', { exact: true });
  await expect(question).toHaveJSProperty('tagName', 'TEXTAREA');
  await expect(editor(page).getByRole('toolbar', { name: '예상 질문 서식', exact: true })).toHaveCount(0);
  await question.fill('앞핵심뒤');
  await expect(question).toHaveValue('앞핵심뒤');

  const answer = editor(page).getByLabel('나의 답변', { exact: true });
  await answer.focus();
  await answer.evaluate(element => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', '첫째\r\n둘째');
    clipboard.setData('text/html', '<strong>외부 서식</strong><script>window.folioPasteExecuted=true</script>');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  await expect(answer).toContainText('첫째');
  await expect(answer).toContainText('둘째');
  await expect(answer.locator('strong,img,script')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).folioPasteExecuted)).toBeUndefined();
  await saved(page);
  const snapshot = JSON.parse(await downloadBackup(page)).project.nodes.find((node: { id: string }) => node.id === 'demo-q6');
  expect(snapshot.question).toBe('앞핵심뒤');
  expect(snapshot.answer).toBe('첫째\n둘째');
  expect(snapshot.questionFormatting ?? []).toEqual([]);
  await closeEditor(page);
  await expect(page.locator('[data-question-id="demo-q6"] .list-question-copy strong')).toHaveText('앞핵심뒤');
  await expect(page.locator('[data-question-id="demo-q6"] .list-question-copy strong .formatted-keyword')).toHaveCount(0);
});

async function saveAnswerPreset(page: Page, name: string) {
  await editor(page).getByRole('button', { name: '서식 저장', exact: true }).click();
  await editor(page).getByLabel('서식 이름', { exact: true }).fill(name);
  await editor(page).getByRole('button', { name: '저장', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: `저장한 서식 ${name} 적용`, exact: true })).toBeVisible();
}

async function emphasizeAnswerPhrase(page: Page, phrase: string) {
  const toolbar = editor(page).getByRole('toolbar', { name: '나의 답변 서식', exact: true });
  await selectRichText(page, '나의 답변', phrase);
  await toolbar.getByRole('button', { name: '굵게', exact: true }).click();
  await toolbar.getByRole('button', { name: '글자색', exact: true }).click();
  await toolbar.getByRole('button', { name: '글자색 빨강', exact: true }).click();
  await toolbar.getByRole('button', { name: '배경색', exact: true }).click();
  await toolbar.getByRole('button', { name: '배경색 노랑', exact: true }).click();
}

test('saves answer emphasis and applies the complete style with one click across answers and backups', async ({ page }) => {
  await openQuestion(page, '바이브 코딩으로 실제 문제를 해결한 경험을 이야기해 주세요.');
  await fillQuestion(page, '서식 원본 질문', '원본 대상 결과');
  const answer = () => editor(page).getByLabel('나의 답변', { exact: true });
  const toolbar = () => editor(page).getByRole('toolbar', { name: '나의 답변 서식', exact: true });
  await emphasizeAnswerPhrase(page, '원본');
  await saveAnswerPreset(page, '핵심');
  await selectRichText(page, '나의 답변', '대상');
  await toolbar().getByRole('button', { name: '글자색', exact: true }).click();
  await toolbar().getByRole('button', { name: '글자색 파랑', exact: true }).click();
  await toolbar().getByRole('button', { name: '배경색', exact: true }).click();
  await toolbar().getByRole('button', { name: '배경색 연두', exact: true }).click();
  const apply = () => editor(page).getByRole('button', { name: '저장한 서식 핵심 적용', exact: true });
  await apply().click();
  const target = () => answer().locator('span[style*="background-color"]').filter({ hasText: '대상' });
  await expect(target()).toHaveCSS('color', 'rgb(180, 35, 24)');
  await expect(target()).toHaveCSS('background-color', 'rgb(255, 241, 168)');
  await expect(answer().locator('strong')).toHaveText(['원본', '대상']);
  await apply().click();
  await expect(answer().locator('strong')).toHaveText(['원본', '대상']);
  await expect(answer()).toHaveText('원본 대상 결과');
  await expect(editor(page).locator('#editor-answer-count')).toContainText('공백 포함 8자');
  await selectAnswerText(page, '결과');
  await fillQuestion(page, '다른 답변의 질문', '성과를 설명합니다.');
  await selectRichText(page, '나의 답변', '성과');
  await apply().click();
  await expect(answer().locator('strong')).toHaveText('성과');
  await expect(answer().locator('span[style*="background-color"]')).toHaveCSS('background-color', 'rgb(255, 241, 168)');
  await saved(page);
  const backup = await downloadBackup(page);
  const snapshot = JSON.parse(backup).project;
  expect(snapshot.answerStylePresets).toEqual([expect.objectContaining({ name: '핵심', bold: true, color: '#b42318', backgroundColor: '#fff1a8' })]);
  const original = snapshot.nodes.find((node: { question: string }) => node.question === '서식 원본 질문');
  expect(original.answer).toBe('원본 대상 결과');
  expect(original.answerFormatting).toEqual([
    { start: 0, end: 2, bold: true, color: '#b42318', backgroundColor: '#fff1a8' },
    { start: 3, end: 5, bold: true, color: '#b42318', backgroundColor: '#fff1a8' },
  ]);
  await page.reload();
  await openQuestion(page, '다른 답변의 질문');
  await expect(apply()).toBeVisible();
  await expect(answer().locator('strong')).toHaveText('성과');
  await page.getByLabel('면접 백업 파일', { exact: true }).setInputFiles({ name: 'saved-style.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await openQuestion(page, '서식 원본 질문');
  await expect(apply()).toBeVisible();
  await selectRichText(page, '나의 답변', '결과');
  await apply().click();
  await expect(answer().locator('strong')).toHaveText(['원본', '대상', '결과']);
});

test('copies default formatting exactly and deletes a saved style without erasing applied emphasis', async ({ page }) => {
  await openQuestion(page, '바이브 코딩으로 실제 문제를 해결한 경험을 이야기해 주세요.');
  await fillQuestion(page, '기본 서식도 복사할 수 있나요?', '일반 강조');
  const answer = editor(page).getByLabel('나의 답변', { exact: true });
  await expect(editor(page).getByRole('button', { name: '서식 저장', exact: true })).toBeDisabled();
  await selectRichText(page, '나의 답변', '일반');
  await saveAnswerPreset(page, '기본');
  await emphasizeAnswerPhrase(page, '강조');
  await editor(page).getByRole('button', { name: '저장한 서식 기본 적용', exact: true }).click();
  await expect(answer.locator('strong,span[style*="color"]')).toHaveCount(0);
  await expect(answer).toHaveText('일반 강조');
  await emphasizeAnswerPhrase(page, '강조');
  await saveAnswerPreset(page, '암기');
  await editor(page).getByRole('button', { name: '저장한 서식 암기 삭제', exact: true }).click();
  await expect(editor(page).getByRole('button', { name: '저장한 서식 암기 적용', exact: true })).toHaveCount(0);
  await expect(answer.locator('strong')).toHaveText('강조');
  await expect(answer.locator('span[style*="background-color"]')).toHaveCSS('background-color', 'rgb(255, 241, 168)');
  await saved(page);
  await page.reload();
  await openQuestion(page, '기본 서식도 복사할 수 있나요?');
  await expect(editor(page).getByRole('button', { name: '저장한 서식 기본 적용', exact: true })).toBeVisible();
  await expect(editor(page).getByRole('button', { name: '저장한 서식 암기 적용', exact: true })).toHaveCount(0);
  await expect(editor(page).getByLabel('나의 답변', { exact: true }).locator('strong')).toHaveText('강조');
});

test('keeps saved answer styles separate between applications and usable in the mobile popup', async ({ page }) => {
  await openQuestion(page, '바이브 코딩으로 실제 문제를 해결한 경험을 이야기해 주세요.');
  await fillQuestion(page, '지원서별 서식', '암기할 키워드');
  await emphasizeAnswerPhrase(page, '키워드');
  await saveAnswerPreset(page, '면접 핵심');
  await saved(page);
  await closeEditor(page);
  await createApplication(page, '서식분리기업', '개발자');
  await uploadResume(page);
  await selectResumeText(page, 'React');
  await expect(editor(page).getByRole('group', { name: '저장한 답변 서식', exact: true })).toHaveCount(0);
  await closeEditor(page);
  await page.getByRole('navigation', { name: '지원서 목록' }).getByRole('button').filter({ hasText: '토스' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '작업 영역 전체화면', exact: true }).click();
  await openQuestion(page, '지원서별 서식');
  const apply = editor(page).getByRole('button', { name: '저장한 서식 면접 핵심 적용', exact: true });
  await selectRichText(page, '나의 답변', '암기할');
  await apply.click();
  await expect(editor(page).getByLabel('나의 답변', { exact: true }).locator('strong')).toHaveText(['암기할', '키워드']);
  const bounds = await apply.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
