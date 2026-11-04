import type { InterviewNode, QuestionCategory, QuestionCategoryFilter, TextFormatting } from '../types';
import type { QuestionOutlineEntry } from './tree';
import { QUESTION_CATEGORIES } from './questionCategories';
import { validateTextFormatting } from './textFormatting';

export type PrintAnswerMode = 'full' | 'keywords';
export type PrintStatusFilter = 'all' | InterviewNode['status'];

export interface PrintScope {
  category: QuestionCategoryFilter;
  status: PrintStatusFilter;
}

export const PRINT_CATEGORY_OPTIONS: readonly { id: QuestionCategoryFilter; label: string }[] = [
  { id: 'all', label: '전체 질문' },
  ...QUESTION_CATEGORIES.map(({ id, label }) => ({ id, label })),
];

export const PRINT_STATUS_OPTIONS: readonly { id: PrintStatusFilter; label: string }[] = [
  { id: 'all', label: '모든 상태' },
  { id: 'ready', label: '준비 완료' },
  { id: 'draft', label: '작성 중' },
];

export type KeywordSegment = Pick<TextFormatting, 'bold' | 'color' | 'backgroundColor'> & { text: string };
/** Directly adjacent emphasized ranges read as one keyword, even when their styles differ. */
export type AnswerKeyword = KeywordSegment[];

export interface PrintEntry extends QuestionOutlineEntry {
  category: QuestionCategory;
  parentLabel?: string;
  /** Emphasized answer keywords grouped by answer line, in reading order. */
  keywordLines: AnswerKeyword[][];
}

function emphasis({ bold, color, backgroundColor }: TextFormatting): Omit<KeywordSegment, 'text'> {
  return { ...(bold ? { bold } : {}), ...(color ? { color } : {}), ...(backgroundColor ? { backgroundColor } : {}) };
}

/** Whitespace at a keyword's edges is not part of what the reader memorizes. */
function trimKeyword(keyword: AnswerKeyword): AnswerKeyword {
  const parts = keyword.map(segment => ({ ...segment }));
  while (parts.length) {
    parts[0].text = parts[0].text.trimStart();
    if (parts[0].text) break;
    parts.shift();
  }
  while (parts.length) {
    const last = parts[parts.length - 1];
    last.text = last.text.trimEnd();
    if (last.text) break;
    parts.pop();
  }
  return parts;
}

/** Collect bold, colored or highlighted answer text per line; malformed styling yields no keywords. */
export function getAnswerKeywords(text: string, formatting?: TextFormatting[]): AnswerKeyword[][] {
  let ranges: TextFormatting[];
  try { ranges = validateTextFormatting(formatting ?? [], text); } catch { return []; }
  const lines: AnswerKeyword[][] = [];
  let offset = 0;
  let rangeIndex = 0;
  for (const line of text.split('\n')) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    offset = lineEnd + 1;
    while (ranges[rangeIndex] && ranges[rangeIndex].end <= lineStart) rangeIndex += 1;
    const keywords: AnswerKeyword[] = [];
    let previousEnd = -1;
    // Ranges are sorted and disjoint, so only those crossing this line are visited.
    for (let index = rangeIndex; index < ranges.length && ranges[index].start < lineEnd; index += 1) {
      const start = Math.max(ranges[index].start, lineStart);
      const end = Math.min(ranges[index].end, lineEnd);
      if (start >= end) continue;
      const segment: KeywordSegment = { text: text.slice(start, end), ...emphasis(ranges[index]) };
      if (previousEnd === start) keywords[keywords.length - 1].push(segment);
      else keywords.push([segment]);
      previousEnd = end;
    }
    const trimmed = keywords.map(trimKeyword).filter(keyword => keyword.length > 0);
    if (trimmed.length) lines.push(trimmed);
  }
  return lines;
}

/** Drop blank lines around an answer for print while keeping every style on its characters. */
export function trimFormattedText(text: string, formatting?: TextFormatting[]): { text: string; formatting: TextFormatting[] } {
  let ranges: TextFormatting[];
  try { ranges = validateTextFormatting(formatting ?? [], text); } catch { ranges = []; }
  const leading = text.length - text.trimStart().length;
  const trimmed = text.trim();
  return {
    text: trimmed,
    formatting: ranges
      .map(range => ({ ...range, start: Math.max(0, range.start - leading), end: Math.min(trimmed.length, range.end - leading) }))
      .filter(range => range.start < range.end),
  };
}

/** Keep the question flow order and stable labels; categories and status only choose what is printed. */
export function selectPrintEntries(outline: QuestionOutlineEntry[], categoryById: ReadonlyMap<string, QuestionCategory>, scope: PrintScope): PrintEntry[] {
  const labels = new Map(outline.map(entry => [entry.node.id, entry.label]));
  const entries: PrintEntry[] = [];
  for (const entry of outline) {
    const category = categoryById.get(entry.node.id) ?? 'resume';
    if (scope.category !== 'all' && category !== scope.category) continue;
    if (scope.status !== 'all' && entry.node.status !== scope.status) continue;
    entries.push({
      ...entry, category,
      parentLabel: entry.parentId ? labels.get(entry.parentId) : undefined,
      keywordLines: getAnswerKeywords(entry.node.answer, entry.node.answerFormatting),
    });
  }
  return entries;
}

/** Whether the chosen answer mode would print anything beyond a placeholder for this question. */
export function hasPrintableAnswer(entry: PrintEntry, mode: PrintAnswerMode): boolean {
  return mode === 'keywords' ? entry.keywordLines.length > 0 : Boolean(entry.node.answer.trim());
}

/** Browsers suggest the document title as the PDF file name. */
export function printFileName(company: string, role: string, category: QuestionCategoryFilter, mode: PrintAnswerMode): string {
  const scope = category === 'all' ? [] : [PRINT_CATEGORY_OPTIONS.find(option => option.id === category)?.label ?? ''];
  return [company, role, ...scope, mode === 'keywords' ? '면접키워드' : '면접스크립트']
    .map(part => part.replace(/[\\/:*?"<>|]+/gu, ' ').replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .join('_');
}
