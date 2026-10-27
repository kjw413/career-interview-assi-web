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

async function selectAnswerText(page: Page, text: string) {
  const field = editor(page).getByLabel('나의 답변', { exact: false });
  await field.focus();
  await field.evaluate((element, phrase) => {
    const textarea = element as HTMLTextAreaElement;
    const start = textarea.value.indexOf(phrase);
    if (start < 0) throw new Error(`Missing answer phrase: ${phrase}`);
    textarea.setSelectionRange(start, start + phrase.length);
    textarea.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    textarea.ownerDocument.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  }, text);
  await page.getByRole('button', { name: `“${text}”에서 꼬리질문 추가`, exact: true }).click();
}

async function fillQuestion(page: Page, question: string, answer: string) {
  await editor(page).getByLabel('예상 질문', { exact: false }).fill(question);
  await editor(page).getByLabel('나의 답변', { exact: false }).fill(answer);
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
  await editor(page).getByLabel('예상 질문', { exact: false }).fill('새 질문이 저장되나요?');
  await expect(completion).toBeDisabled();
  await editor(page).getByLabel('나의 답변', { exact: false }).fill('브라우저에 작성한 내용을 보관합니다.');
  await expect(completion).toBeEnabled();
  await completion.check();
  await saved(page);
  await page.reload();
  await openQuestion(page, '새 질문이 저장되나요?');
  await expect(editor(page).getByLabel('나의 답변', { exact: false })).toHaveValue('브라우저에 작성한 내용을 보관합니다.');
  await expect(editor(page).getByRole('checkbox')).toBeChecked();
  await editor(page).getByLabel('나의 답변', { exact: false }).fill('');
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
  await page.getByLabel('면접 백업 파일', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('navigation', { name: '지원서 목록' }).getByRole('button')).toHaveCount(2);
  await expect(page.getByText('백업을 새로운 지원서로 불러왔습니다.', { exact: true })).toBeVisible();
  await questionList(page);
  await expect(page.locator('.question-list-item')).toHaveCount(6);
  await saved(page);
  const restored = JSON.parse(await downloadBackup(page));
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
  await editor(page).getByLabel('예상 질문', { exact: false }).fill('모바일에서도 질문을 작성할 수 있나요?');
  await saved(page);
  await expect(editor(page).getByLabel('예상 질문', { exact: false })).toHaveValue('모바일에서도 질문을 작성할 수 있나요?');
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);
  expect(widths.root).toBeLessThanOrEqual(widths.viewport);
  await page.getByRole('button', { name: '질문 편집 닫기', exact: true }).click();
  await expect(editor(page)).toBeHidden();
});
