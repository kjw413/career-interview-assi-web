import { describe, expect, it } from 'vitest';
import type { InterviewNode, TextFormatting } from '../types';
import { getQuestionOutline } from './tree';
import { getQuestionCategories } from './questionCategories';
import { getAnswerKeywords, hasPrintableAnswer, printFileName, selectPrintEntries, trimFormattedText } from './printScript';

function styled(text: string, phrase: string, style: Omit<TextFormatting, 'start' | 'end'>, from = 0): TextFormatting {
  const start = text.indexOf(phrase, from);
  if (start < 0) throw new Error(`Missing phrase: ${phrase}`);
  return { start, end: start + phrase.length, ...style };
}

function node(id: string, parentId: string | null, patch: Partial<InterviewNode> = {}): InterviewNode {
  return { id, parentId, anchor: '', question: `${id} 질문`, answer: `${id} 답변`, status: 'ready', ...patch };
}

describe('print keyword extraction', () => {
  it('keeps emphasized phrases in reading order, grouped by answer line', () => {
    const text = '저는 사용자 인터뷰와 행동 데이터를 살폈습니다.\n\n이탈 원인을 찾아 절차를 3단계로 줄였습니다.';
    expect(getAnswerKeywords(text, [
      styled(text, '사용자 인터뷰', { bold: true }),
      styled(text, '행동 데이터', { color: '#175cd3' }),
      styled(text, '이탈 원인', { backgroundColor: '#fff1a8' }),
      styled(text, '3단계', { bold: true, color: '#b42318' }),
    ])).toEqual([
      [[{ text: '사용자 인터뷰', bold: true }], [{ text: '행동 데이터', color: '#175cd3' }]],
      [[{ text: '이탈 원인', backgroundColor: '#fff1a8' }], [{ text: '3단계', bold: true, color: '#b42318' }]],
    ]);
  });

  it('joins directly adjacent styles into one keyword and trims whitespace at its edges only', () => {
    const text = '성과는 가입 완료율 24% 개선 확인';
    const keywords = getAnswerKeywords(text, [
      // The leading space and the separate unstyled gap before 24% keep these two keywords apart.
      { start: 3, end: 10, bold: true },
      styled(text, '24%', { bold: true, color: '#b42318' }),
      styled(text, ' 개선', { backgroundColor: '#fff1a8' }),
      { start: 17, end: 18, bold: true },
    ]);
    expect(keywords).toEqual([[
      [{ text: '가입 완료율', bold: true }],
      [{ text: '24%', bold: true, color: '#b42318' }, { text: ' 개선', backgroundColor: '#fff1a8' }],
    ]]);
  });

  it('splits a style that crosses a line break and skips whitespace-only emphasis', () => {
    const text = '첫 줄 핵심\n둘째 줄 요약\n   \n😀 이모지 키워드';
    expect(getAnswerKeywords(text, [
      { start: 4, end: 9, bold: true },
      { start: 15, end: 18, color: '#27704b' },
      styled(text, '😀 이모지', { backgroundColor: '#dbeafe' }),
    ])).toEqual([
      [[{ text: '핵심', bold: true }]],
      [[{ text: '둘째', bold: true }]],
      [[{ text: '😀 이모지', backgroundColor: '#dbeafe' }]],
    ]);
  });

  it('prints no keywords for unformatted answers or malformed styling', () => {
    expect(getAnswerKeywords('강조 없는 답변')).toEqual([]);
    expect(getAnswerKeywords('강조 없는 답변', [])).toEqual([]);
    expect(getAnswerKeywords('짧은 답변', [{ start: 0, end: 30, bold: true }])).toEqual([]);
    expect(getAnswerKeywords('겹친 서식', [{ start: 0, end: 3, bold: true }, { start: 2, end: 4, color: '#b42318' }])).toEqual([]);
  });
});

describe('print answer trimming', () => {
  it('removes surrounding blank lines and shifts styles with their characters', () => {
    const text = '\n\n  핵심 답변입니다.\n\n';
    expect(trimFormattedText(text, [{ start: 0, end: 6, color: '#175cd3' }, styled(text, '답변', { bold: true }), { start: 12, end: 14, bold: true }]))
      .toEqual({ text: '핵심 답변입니다.', formatting: [{ start: 0, end: 2, color: '#175cd3' }, { start: 3, end: 5, bold: true }, { start: 8, end: 9, bold: true }] });
  });

  it('keeps the plain text when stored styling is malformed', () => {
    expect(trimFormattedText(' 답변 ', [{ start: 0, end: 20, bold: true }])).toEqual({ text: '답변', formatting: [] });
  });
});

describe('print question selection', () => {
  const nodes: InterviewNode[] = [
    node('root', null, { category: 'basic', answer: '지원동기 핵심', answerFormatting: [{ start: 5, end: 7, bold: true }] }),
    node('child', 'root', { category: 'resume', status: 'draft', answer: '' }),
    node('grandchild', 'child', { category: 'basic', answer: '강조 없는 답변' }),
    node('second', null, { category: 'fundamentals' }),
  ];
  const outline = getQuestionOutline(nodes);
  const categories = getQuestionCategories(nodes);

  it('keeps flow order, stable labels and parent references through category and status filters', () => {
    expect(selectPrintEntries(outline, categories, { category: 'all', status: 'all' }).map(entry => [entry.label, entry.node.id, entry.parentLabel]))
      .toEqual([['1-1', 'root', undefined], ['1-2', 'child', '1-1'], ['1-3', 'grandchild', '1-2'], ['2-1', 'second', undefined]]);
    const basic = selectPrintEntries(outline, categories, { category: 'basic', status: 'all' });
    expect(basic.map(entry => [entry.label, entry.category, entry.parentLabel, entry.depth])).toEqual([['1-1', 'basic', undefined, 0], ['1-3', 'basic', '1-2', 2]]);
    expect(selectPrintEntries(outline, categories, { category: 'all', status: 'draft' }).map(entry => entry.label)).toEqual(['1-2']);
    expect(selectPrintEntries(outline, categories, { category: 'resume', status: 'ready' })).toEqual([]);
  });

  it('decides printable answers by mode so empty or unemphasized answers can be skipped', () => {
    const entries = selectPrintEntries(outline, categories, { category: 'all', status: 'all' });
    expect(entries[0].keywordLines).toEqual([[[{ text: '핵심', bold: true }]]]);
    expect(entries.filter(entry => hasPrintableAnswer(entry, 'full')).map(entry => entry.label)).toEqual(['1-1', '1-3', '2-1']);
    expect(entries.filter(entry => hasPrintableAnswer(entry, 'keywords')).map(entry => entry.label)).toEqual(['1-1']);
  });
});

describe('print file name', () => {
  it('names the PDF by application, scope and mode without path separators', () => {
    expect(printFileName('토스', '프론트엔드 개발자', 'all', 'full')).toBe('토스_프론트엔드 개발자_면접스크립트');
    expect(printFileName('A/B 컴퍼니', 'R&D: 엔지니어', 'situational', 'keywords')).toBe('A B 컴퍼니_R&D 엔지니어_상황·가치관_면접키워드');
  });
});
