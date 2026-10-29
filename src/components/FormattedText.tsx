import { Fragment, type CSSProperties } from 'react';
import type { TextFormatting } from '../types';
import { validateTextFormatting } from '../lib/textFormatting';

/** Render stored formatting as React text and safe style values, without HTML. */
export default function FormattedText({ text, formatting }: { text: string; formatting?: TextFormatting[] }) {
  let ranges: TextFormatting[];
  try { ranges = formatting ? validateTextFormatting(formatting, text) : []; }
  catch { return <>{text}</>; }
  let cursor = 0;
  const parts = ranges.map((range, index) => {
    const before = text.slice(cursor, range.start);
    cursor = range.end;
    const style: CSSProperties = {
      ...(range.bold ? { fontWeight: 750 } : {}),
      ...(range.color ? { color: range.color } : {}),
      ...(range.backgroundColor ? { backgroundColor: range.backgroundColor, borderRadius: 2 } : {}),
    };
    return <Fragment key={index}>{before}<span className="formatted-keyword" style={style}>{text.slice(range.start, range.end)}</span></Fragment>;
  });
  return <>{parts}{text.slice(cursor)}</>;
}
