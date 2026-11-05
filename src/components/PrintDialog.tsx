import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Highlighter, Printer, ScrollText } from 'lucide-react';
import type { Project, QuestionCategory, QuestionCategoryFilter } from '../types';
import type { QuestionOutlineEntry } from '../lib/tree';
import {
  PRINT_CATEGORY_OPTIONS, PRINT_STATUS_OPTIONS, hasPrintableAnswer, printFileName, selectPrintEntries,
  type PrintAnswerMode, type PrintStatusFilter,
} from '../lib/printScript';
import PrintSheet from './PrintSheet';
import './print.css';

interface PrintDialogProps {
  project: Project;
  outline: QuestionOutlineEntry[];
  categoryById: ReadonlyMap<string, QuestionCategory>;
  initialCategory: QuestionCategoryFilter;
  initialStatus: PrintStatusFilter;
}

interface PrintPreferences {
  mode: PrintAnswerMode;
  skipEmpty: boolean;
}

const PREFERENCES_KEY = 'folio-print-preferences';
const MODES: { id: PrintAnswerMode; label: string; description: string; icon: ReactNode }[] = [
  { id: 'full', label: '전체 답변', description: '강조 서식을 살린 답변 전체를 인쇄해요. 스크립트를 통째로 외울 때 좋아요.', icon: <ScrollText size={17} /> },
  { id: 'keywords', label: '강조 키워드만', description: '굵게·글자색·배경색으로 강조한 부분만 답변 순서대로 모아요. 키워드로 답변 흐름을 떠올릴 때 좋아요.', icon: <Highlighter size={17} /> },
];

function readPreferences(): PrintPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null') as Partial<PrintPreferences> | null;
    return { mode: saved?.mode === 'keywords' ? 'keywords' : 'full', skipEmpty: saved?.skipEmpty === true };
  } catch {
    return { mode: 'full', skipEmpty: false };
  }
}

export default function PrintDialog({ project, outline, categoryById, initialCategory, initialStatus }: PrintDialogProps) {
  const [category, setCategory] = useState(initialCategory);
  const [status, setStatus] = useState(initialStatus);
  const [{ mode, skipEmpty }, setPreferences] = useState(readPreferences);
  const [printedAt] = useState(() => new Date().toLocaleDateString('ko-KR'));
  const candidates = useMemo(() => selectPrintEntries(outline, categoryById, { category, status }), [outline, categoryById, category, status]);
  const entries = useMemo(() => skipEmpty ? candidates.filter(entry => hasPrintableAnswer(entry, mode)) : candidates, [candidates, skipEmpty, mode]);
  const unanswered = candidates.filter(entry => !entry.node.answer.trim()).length;
  const unemphasized = candidates.filter(entry => entry.node.answer.trim() && !entry.keywordLines.length).length;
  const fileName = useRef('');
  fileName.current = printFileName(project.company, project.role, category, mode);

  useEffect(() => {
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ mode, skipEmpty })); } catch { /* Printing works without remembered preferences. */ }
  }, [mode, skipEmpty]);

  useEffect(() => {
    // Browsers suggest the document title as the PDF name, including for Ctrl+P while this dialog is open.
    const original = document.title;
    const name = () => { document.title = fileName.current; };
    const restore = () => { document.title = original; };
    window.addEventListener('beforeprint', name);
    window.addEventListener('afterprint', restore);
    return () => { window.removeEventListener('beforeprint', name); window.removeEventListener('afterprint', restore); restore(); };
  }, []);

  async function print() {
    // Korean web fonts load per glyph subset; let the preview's glyphs finish so print never falls back mid-page.
    if (document.fonts && document.fonts.status !== 'loaded') {
      await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 3000))]);
    }
    document.title = fileName.current;
    window.print();
  }

  // The preview and the print copy share one element, so unrelated app re-renders skip both.
  const sheet = useMemo(() => <PrintSheet company={project.company} role={project.role} entries={entries} scope={{ category, status }} mode={mode} printedAt={printedAt} />,
    [project.company, project.role, entries, category, status, mode, printedAt]);
  const excluded = candidates.length - entries.length;
  return <div className="print-dialog">
    <section className="print-settings" aria-label="인쇄 설정">
      <p className="eyebrow">PRINT FOR PRACTICE</p>
      <h2>종이로 보며 외워 보세요</h2>
      <p className="modal-description print-description">A4 용지에 좁은 여백(10mm)으로, 긴 답변도 잘리지 않고 다음 쪽으로 이어지게 인쇄해요.</p>
      <div className="print-field-row">
        <div>
          <label className="form-label" htmlFor="print-category">출력 분야</label>
          <select id="print-category" value={category} onChange={event => setCategory(event.target.value as QuestionCategoryFilter)}>
            {PRINT_CATEGORY_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="print-status">준비 상태</label>
          <select id="print-status" value={status} onChange={event => setStatus(event.target.value as PrintStatusFilter)}>
            {PRINT_STATUS_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </div>
      </div>
      <fieldset className="print-mode">
        <legend className="form-label">답변 출력</legend>
        {MODES.map(option => <label key={option.id} className={`print-mode-option${mode === option.id ? ' is-selected' : ''}`}>
          <input type="radio" name="print-answer-mode" value={option.id} checked={mode === option.id}
            onChange={() => setPreferences(current => ({ ...current, mode: option.id }))} />
          <span className="print-mode-icon" aria-hidden="true">{option.icon}</span>
          <span className="print-mode-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
        </label>)}
      </fieldset>
      <label className="print-skip">
        <input type="checkbox" checked={skipEmpty} onChange={event => setPreferences(current => ({ ...current, skipEmpty: event.target.checked }))} />
        <span>{mode === 'keywords' ? '강조 키워드가 없는 질문 제외' : '답변을 작성하지 않은 질문 제외'}</span>
      </label>
      <div className="print-summary" role="status">
        <p><strong>질문 {entries.length}개</strong>를 인쇄해요.{excluded > 0 && ` ${excluded}개는 제외했어요.`}</p>
        {!skipEmpty && mode === 'keywords' && unemphasized > 0 && <p className="print-summary-note">강조 키워드가 없는 답변 {unemphasized}개는 안내 문구로 표시돼요.</p>}
        {!skipEmpty && unanswered > 0 && <p className="print-summary-note">답변을 작성하지 않은 질문 {unanswered}개가 포함돼요.</p>}
      </div>
      <button type="button" className="button button-primary form-submit" disabled={!entries.length} onClick={() => void print()}>PDF로 인쇄<Printer size={16} /></button>
      <p className="print-hint">인쇄 창의 대상에서 <strong>PDF로 저장</strong>을 고르면 파일로 저장돼요. <strong>머리글과 바닥글</strong>을 해제하면 더 깔끔해요.</p>
    </section>
    <div className="print-preview" role="region" aria-label="인쇄 미리보기" tabIndex={0}>
      <p className="print-preview-caption">미리보기 · A4 세로 · 여백 10mm</p>
      {sheet}
    </div>
    {createPortal(<div className="print-root">{sheet}</div>, document.body)}
  </div>;
}
