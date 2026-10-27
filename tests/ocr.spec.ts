import { expect, test, type Page } from '@playwright/test';

async function newApplication(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '새 지원서 만들기', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '새 지원서 만들기' });
  await dialog.getByLabel('지원 기업', { exact: true }).fill('문서 검증 기업');
  await dialog.getByLabel('지원 직무', { exact: true }).fill('개발자');
  await dialog.getByRole('button', { name: '지원서 만들기', exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** Rasterize fictional resume content in the browser, then embed the JPEG in a PDF. */
async function scannedPdf(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const lines = ['김지원', '프론트엔드 개발자', '경력 사항', '반복 업무를 자동화하는 도구를 만들었습니다.', 'Frontend Developer and TypeScript'];
    await document.fonts.load('32px "Noto Sans KR Variable"', lines.join(' '));
    const canvas = document.createElement('canvas');
    canvas.width = 1000; canvas.height = 700;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#fff'; context.fillRect(0, 0, 1000, 700);
    context.fillStyle = '#111'; context.font = '32px "Noto Sans KR Variable", sans-serif';
    lines.forEach((line, index) => context.fillText(line, 55, 90 + index * 90));
    return canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  });
  const jpeg = Buffer.from(base64, 'base64');
  const drawing = 'q 1000 0 0 700 0 0 cm /Im0 Do Q';
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 700] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1000 /Height 700 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')]),
    Buffer.from(`<< /Length ${drawing.length} >>\nstream\n${drawing}\nendstream`),
  ];
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let size = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(size);
    const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]);
    parts.push(part); size += part.length;
  });
  const xref = `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}

test('recognizes a Korean and English image-only PDF locally and persists the extracted text', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const external: string[] = [];
  const appOrigin = new URL(baseURL!).origin;
  page.on('request', (request) => { if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== appOrigin) external.push(request.url()); });
  await newApplication(page);
  await page.getByLabel('이력서 PDF 파일', { exact: true }).setInputFiles({ name: 'scanned-resume.pdf', mimeType: 'application/pdf', buffer: await scannedPdf(page) });
  await expect(page.locator('.resume-document')).toContainText('김지원', { timeout: 60_000 });
  await expect(page.locator('.resume-document')).toContainText('자동화');
  await expect(page.locator('.resume-document')).toContainText('Frontend');
  await expect(page.getByText('OCR 인식 완료', { exact: true })).toBeVisible();
  await expect(page.getByText('모든 변경사항 저장됨', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.resume-document')).toContainText('김지원');
  expect(external).toEqual([]);
});

test('rejects invalid PDF bytes and allows direct resume text as a fallback', async ({ page }) => {
  await newApplication(page);
  await page.getByLabel('이력서 PDF 파일', { exact: true }).setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('This is not a PDF') });
  await expect(page.getByRole('status')).toContainText('올바른 PDF 파일이 아닙니다');
  await expect(page.getByRole('heading', { name: '이력서에서 시작하세요' })).toBeVisible();
  await page.getByRole('button', { name: '또는 텍스트로 직접 입력', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '이력서 텍스트 입력' });
  await dialog.getByLabel('이력서 내용', { exact: true }).fill('김지원\n개발자\n특기사항\n반복 업무 자동화와 바이브 코딩');
  await dialog.getByRole('button', { name: '이력서 저장', exact: true }).click();
  await expect(page.locator('.resume-document')).toContainText('바이브 코딩');
  await page.getByRole('button', { name: '질문 추가', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '질문 편집', exact: true })).toBeVisible();
});

test('cancels an upload without leaving a pending document or questions', async ({ page }) => {
  await newApplication(page);
  const buffer = await scannedPdf(page);
  await page.getByLabel('이력서 PDF 파일', { exact: true }).setInputFiles({ name: 'cancel-resume.pdf', mimeType: 'application/pdf', buffer });
  await expect(page.locator('.upload-progress')).toBeVisible();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('heading', { name: '이력서에서 시작하세요' })).toBeVisible();
  await expect(page.locator('.react-flow__node-question')).toHaveCount(0);
});
