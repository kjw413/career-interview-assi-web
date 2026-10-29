import { describe, expect, it } from 'vitest';
import type { TextFormatting } from '../types';
import { fromRichTextDocument, toRichTextDocument, validateTextFormatting } from './textFormatting';

describe('question and answer text formatting', () => {
  it('round-trips Korean, emoji, empty lines, and combined inline styles without changing plain text', () => {
    const text = '중요 😀\n\n성과 24%\n';
    const formatting: TextFormatting[] = [
      { start: 0, end: 2, bold: true },
      { start: 3, end: 5, color: '#b83232', backgroundColor: '#fff1a8' },
      { start: 7, end: 13, bold: true, color: '#245db0' },
    ];
    const document = toRichTextDocument(text, formatting);
    expect(document.content).toHaveLength(4);
    expect(document.content?.[0].content?.[2]).toEqual({ type: 'text', text: '😀', marks: [{ type: 'textStyle', attrs: { color: '#b83232', backgroundColor: '#fff1a8' } }] });
    expect(fromRichTextDocument(document)).toEqual({ text, formatting });
  });

  it('canonicalizes marks split by the editor and preserves hard breaks and paragraph breaks', () => {
    expect(fromRichTextDocument({ type: 'doc', content: [
      { type: 'paragraph', content: [
        { type: 'text', text: '핵심', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' 키워드', marks: [{ type: 'bold' }] },
        { type: 'hardBreak' },
        { type: 'text', text: '다음 줄', marks: [{ type: 'textStyle', attrs: { color: '#AABBCC', backgroundColor: 'url(evil)' } }] },
      ] },
      { type: 'paragraph', content: [{ type: 'text', text: '새 문단', marks: [{ type: 'link', attrs: { href: 'javascript:evil' } }] }] },
    ] })).toEqual({ text: '핵심 키워드\n다음 줄\n새 문단', formatting: [
      { start: 0, end: 6, bold: true }, { start: 7, end: 11, color: '#aabbcc' },
    ] });
  });

  it('normalizes sorted disjoint styles and rejects unsafe, overlapping or stale annotations', () => {
    expect(validateTextFormatting([{ start: 2, end: 4, color: '#AABBCC' }, { start: 0, end: 2, color: '#aabbcc' }], '키워드들')).toEqual([
      { start: 0, end: 4, color: '#aabbcc' },
    ]);
    const invalid = [
      null, {}, [{ start: 0, end: 0, bold: true }], [{ start: -1, end: 1, bold: true }],
      [{ start: 0, end: 5, bold: true }], [{ start: 0.5, end: 1, bold: true }],
      [{ start: 0, end: 2, bold: false }], [{ start: 0, end: 2 }],
      [{ start: 0, end: 2, color: 'red' }], [{ start: 0, end: 2, backgroundColor: 'url(evil)' }],
      [{ start: 0, end: 2, color: '#ffffff', href: 'javascript:evil' }],
      [{ start: 0, end: 2, bold: true }, { start: 1, end: 3, color: '#aabbcc' }],
      Array.from({ length: 20_001 }, () => ({ start: 0, end: 1, bold: true })),
    ];
    for (const value of invalid) expect(() => validateTextFormatting(value, '키워드들')).toThrow('서식');
    expect(() => validateTextFormatting([{ start: 0, end: 1, bold: true }], '😀')).toThrow('서식');
    expect(() => validateTextFormatting([{ start: 1, end: 2, bold: true }], '😀')).toThrow('서식');
  });

  it('recovers unformatted text from legacy or damaged annotations, including empty text', () => {
    expect(fromRichTextDocument(toRichTextDocument('기존 답변'))).toEqual({ text: '기존 답변', formatting: [] });
    expect(fromRichTextDocument(toRichTextDocument('😀원문', [{ start: 0, end: 1, bold: true }]))).toEqual({ text: '😀원문', formatting: [] });
    expect(toRichTextDocument('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(fromRichTextDocument(toRichTextDocument(''))).toEqual({ text: '', formatting: [] });
    expect(fromRichTextDocument({ type: 'doc', content: [{ type: 'paragraph', content: [
      { type: 'text', text: '\ud83d', marks: [{ type: 'bold' }] }, { type: 'text', text: '\ude00' },
    ] }] })).toEqual({ text: '😀', formatting: [] });
  });
});
