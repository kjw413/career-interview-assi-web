import type { JSONContent } from '@tiptap/core';
import type { TextFormatting } from '../types';

export type RichTextDocument = JSONContent;
const COLOR = /^#[\da-f]{6}$/i;
const MAX_FORMATTING_RANGES = 20_000;

function invalid(): never {
  throw new Error('글자 서식의 범위나 색상 정보가 올바르지 않습니다.');
}

function splitsSurrogatePair(text: string, index: number): boolean {
  return index > 0 && index < text.length
    && /[\uD800-\uDBFF]/u.test(text[index - 1]) && /[\uDC00-\uDFFF]/u.test(text[index]);
}

function sameStyle(left: TextFormatting, right: TextFormatting): boolean {
  return left.bold === right.bold && left.color === right.color && left.backgroundColor === right.backgroundColor;
}

function appendRange(ranges: TextFormatting[], range: TextFormatting): void {
  const previous = ranges[ranges.length - 1];
  if (previous && previous.end === range.start && sameStyle(previous, range)) previous.end = range.end;
  else ranges.push(range);
}

/** Strict boundary for backup imports; returns fresh, normalized style ranges. */
export function validateTextFormatting(value: unknown, text: string): TextFormatting[] {
  if (!Array.isArray(value) || value.length > MAX_FORMATTING_RANGES) invalid();
  const ranges = value.map((item): TextFormatting => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) invalid();
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).some(key => !['start', 'end', 'bold', 'color', 'backgroundColor'].includes(key))) invalid();
    const { start, end, bold, color, backgroundColor } = entry;
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isInteger(start) || !Number.isInteger(end)
      || start < 0 || start >= end || end > text.length || splitsSurrogatePair(text, start) || splitsSurrogatePair(text, end)) invalid();
    if (bold !== undefined && bold !== true) invalid();
    if (color !== undefined && (typeof color !== 'string' || !COLOR.test(color))) invalid();
    if (backgroundColor !== undefined && (typeof backgroundColor !== 'string' || !COLOR.test(backgroundColor))) invalid();
    if (!bold && color === undefined && backgroundColor === undefined) invalid();
    return { start, end, ...(bold ? { bold } : {}),
      ...(typeof color === 'string' ? { color: color.toLowerCase() } : {}),
      ...(typeof backgroundColor === 'string' ? { backgroundColor: backgroundColor.toLowerCase() } : {}) };
  }).sort((left, right) => left.start - right.start);
  const normalized: TextFormatting[] = [];
  for (const range of ranges) {
    if (normalized.length && normalized[normalized.length - 1].end > range.start) invalid();
    appendRange(normalized, range);
  }
  return normalized;
}

function marksFor(range: TextFormatting): NonNullable<JSONContent['marks']> {
  const marks: NonNullable<JSONContent['marks']> = [];
  if (range.bold) marks.push({ type: 'bold' });
  const attrs: Record<string, string> = {};
  if (range.color) attrs.color = range.color;
  if (range.backgroundColor) attrs.backgroundColor = range.backgroundColor;
  if (Object.keys(attrs).length) marks.push({ type: 'textStyle', attrs });
  return marks;
}

/** Existing plain text is always retained, even if saved styling is malformed. */
export function toRichTextDocument(text: string, formatting?: TextFormatting[]): RichTextDocument {
  let ranges: TextFormatting[] = [];
  try { ranges = validateTextFormatting(formatting ?? [], text); } catch { /* Recover the original plain text. */ }
  let offset = 0;
  let rangeIndex = 0;
  const content = text.split('\n').map((line): JSONContent => {
    const lineEnd = offset + line.length;
    const children: JSONContent[] = [];
    let cursor = offset;
    while (cursor < lineEnd) {
      while (ranges[rangeIndex] && ranges[rangeIndex].end <= cursor) rangeIndex += 1;
      const range = ranges[rangeIndex];
      const styled = range && range.start <= cursor;
      const end = Math.min(lineEnd, styled ? range.end : range?.start ?? lineEnd);
      const part: JSONContent = { type: 'text', text: text.slice(cursor, end) };
      if (styled) part.marks = marksFor(range);
      children.push(part);
      cursor = end;
    }
    offset = lineEnd + 1;
    return { type: 'paragraph', ...(children.length ? { content: children } : {}) };
  });
  return { type: 'doc', content };
}

/** Store safe inline annotations alongside text; HTML never enters the data model. */
export function fromRichTextDocument(document: RichTextDocument): { text: string; formatting: TextFormatting[] } {
  let text = '';
  const formatting: TextFormatting[] = [];
  function read(node: JSONContent): void {
    if (node.type === 'hardBreak') { text += '\n'; return; }
    if (node.type === 'text' && typeof node.text === 'string') {
      const start = text.length;
      text += node.text;
      if (start === text.length) return;
      const style: TextFormatting = { start, end: text.length };
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') style.bold = true;
        if (mark.type === 'textStyle') {
          if (typeof mark.attrs?.color === 'string' && COLOR.test(mark.attrs.color)) style.color = mark.attrs.color.toLowerCase();
          if (typeof mark.attrs?.backgroundColor === 'string' && COLOR.test(mark.attrs.backgroundColor)) style.backgroundColor = mark.attrs.backgroundColor.toLowerCase();
        }
      }
      if (style.bold || style.color || style.backgroundColor) appendRange(formatting, style);
      return;
    }
    for (const child of node.content ?? []) read(child);
  }
  (document.content ?? []).forEach((node, index) => { if (index) text += '\n'; read(node); });
  return { text, formatting: formatting.filter(range => !splitsSurrogatePair(text, range.start) && !splitsSurrogatePair(text, range.end)) };
}
