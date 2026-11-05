import { Fragment } from 'react';
import FormattedText, { formattingStyle } from './FormattedText';
import { QUESTION_CATEGORIES } from '../lib/questionCategories';
import { PRINT_CATEGORY_OPTIONS, PRINT_STATUS_OPTIONS, trimFormattedText, type PrintAnswerMode, type PrintEntry, type PrintScope } from '../lib/printScript';

interface PrintSheetProps {
  company: string;
  role: string;
  entries: PrintEntry[];
  scope: PrintScope;
  mode: PrintAnswerMode;
  printedAt: string;
}

function PrintAnswer({ entry, mode }: { entry: PrintEntry; mode: PrintAnswerMode }) {
  const { answer, answerFormatting } = entry.node;
  if (!answer.trim()) return <span className="print-placeholder">답변을 아직 작성하지 않았어요.</span>;
  if (mode === 'full') {
    const trimmed = trimFormattedText(answer, answerFormatting);
    return <FormattedText text={trimmed.text} formatting={trimmed.formatting} />;
  }
  if (!entry.keywordLines.length) return <span className="print-placeholder">강조 표시한 키워드가 없어요.</span>;
  return <>{entry.keywordLines.map((line, lineIndex) => <span className="print-keyword-line" key={lineIndex}>
    {line.map((keyword, index) => <Fragment key={index}>
      {/* The non-breaking space keeps each separator at the end of a wrapped line. */}
      {index > 0 && <span className="print-keyword-separator" aria-hidden="true">{' · '}</span>}
      <span className="print-keyword">{keyword.map((segment, part) => <span key={part} style={formattingStyle(segment)}>{segment.text}</span>)}</span>
    </Fragment>)}
  </span>)}</>;
}

/** One continuous document; the browser paginates it so long answers flow onto the next page instead of being cut. */
export default function PrintSheet({ company, role, entries, scope, mode, printedAt }: PrintSheetProps) {
  const title = mode === 'keywords' ? '면접 키워드 노트' : '면접 답변 스크립트';
  const scopeLabel = PRINT_CATEGORY_OPTIONS.find(option => option.id === scope.category)?.label;
  const statusLabel = PRINT_STATUS_OPTIONS.find(option => option.id === scope.status)?.label;
  return <article className={`print-sheet print-sheet-${mode}`}>
    <header className="print-sheet-header">
      <div className="print-sheet-title">
        <p className="print-sheet-kicker">{company} · {role}</p>
        <h1>{title}</h1>
      </div>
      <p className="print-sheet-meta">{scopeLabel} · {statusLabel} · 질문 {entries.length}개<br />{printedAt} 출력</p>
    </header>
    {entries.length ? <ol className="print-sheet-list">
      {entries.map(entry => {
        const { node, label, depth, parentId } = entry;
        const anchor = node.anchor.replace(/\s+/gu, ' ').trim();
        const details = [
          entry.parentLabel && `${entry.parentLabel}의 꼬리질문`,
          scope.category === 'all' && QUESTION_CATEGORIES.find(category => category.id === entry.category)?.label,
          node.status === 'draft' && '작성 중',
          anchor && `“${anchor}”`,
        ].filter((detail): detail is string => Boolean(detail));
        return <li key={node.id} className={`print-item ${parentId ? 'print-item-follow-up' : 'print-item-root'}`}
          style={depth ? { marginLeft: `${Math.min(depth, 3) * 5}mm` } : undefined}>
          <p className="print-item-meta"><span className="print-item-label">{label}</span>{details.map((detail, index) => <span key={index}>{detail}</span>)}</p>
          <p className="print-item-question"><span className="print-mark" aria-hidden="true">Q</span>{node.question.trim() || <span className="print-placeholder">질문을 아직 작성하지 않았어요.</span>}</p>
          <div className="print-item-answer"><span className="print-mark" aria-hidden="true">A</span><PrintAnswer entry={entry} mode={mode} /></div>
        </li>;
      })}
    </ol> : <p className="print-sheet-empty">인쇄할 질문이 없어요. 출력 분야나 준비 상태를 바꿔 보세요.</p>}
  </article>;
}
