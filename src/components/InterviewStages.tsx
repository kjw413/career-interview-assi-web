import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, X } from 'lucide-react';
import type { InterviewNode, InterviewStage } from '../types';
import { INTERVIEW_STAGES } from '../lib/interviewStages';
import { getQuestionOutline } from '../lib/tree';
import { getQuestionCategories, QUESTION_CATEGORIES } from '../lib/questionCategories';
import './interview-stages.css';

interface InterviewStagesProps {
  value: InterviewStage;
  counts: Record<InterviewStage, number>;
  nodes: InterviewNode[];
  onChange: (stage: InterviewStage) => void;
  onCopy: (ids: ReadonlySet<string>) => void;
  disabled?: boolean;
}

function CopyQuestionsDialog({ nodes, targetLabel, onClose, onCopy }: {
  nodes: InterviewNode[];
  targetLabel: string;
  onClose: () => void;
  onCopy: (ids: ReadonlySet<string>) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const outline = useMemo(() => getQuestionOutline(nodes), [nodes]);
  const categories = useMemo(() => getQuestionCategories(nodes), [nodes]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedIds = new Set(outline.filter(entry => selected.has(entry.node.id)).map(entry => entry.node.id));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = panel.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]') ?? []);
    dialog?.querySelector<HTMLElement>('.stage-copy-close')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        if (event.shiftKey && document.activeElement === elements[0]) {
          event.preventDefault(); elements.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === elements.at(-1)) {
          event.preventDefault(); elements[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('keydown', handleKey); previous?.focus(); };
  }, []);

  function toggle(id: string, checked: boolean) {
    setSelected(current => {
      const next = new Set(current);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  return createPortal(<div className="stage-copy-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className="stage-copy-dialog" role="dialog" aria-modal="true" aria-label="복사할 질문 선택" aria-describedby="stage-copy-description">
      <header className="stage-copy-header">
        <div><h2>복사할 질문 선택</h2><p id="stage-copy-description">선택한 질문과 답변을 {targetLabel}으로 복사해요. 원래 내용은 유지돼요.</p></div>
        <button type="button" className="stage-copy-close" aria-label="복사 창 닫기" onClick={onClose}><X size={20} /></button>
      </header>
      <p className="stage-copy-guide">부모를 선택하지 않은 꼬리질문은 독립 질문이 돼요.</p>
      <div className="stage-copy-selection">
        <span aria-live="polite">전체 {outline.length}개 중 <strong>{selectedIds.size}개 선택</strong></span>
        <div><button type="button" onClick={() => setSelected(new Set(outline.map(entry => entry.node.id)))}>전체 선택</button><button type="button" onClick={() => setSelected(new Set())} disabled={selectedIds.size === 0}>선택 해제</button></div>
      </div>
      <div className="stage-copy-list" aria-label="복사할 질문 목록">
        {outline.map(({ node, label, depth, parentId }) => <label key={node.id} className={`stage-copy-question${selected.has(node.id) ? ' is-selected' : ''}`}>
          <input type="checkbox" checked={selected.has(node.id)} onChange={event => toggle(node.id, event.target.checked)} aria-label={`${label} ${node.question || '아직 작성하지 않은 질문'}`} />
          <span className="stage-copy-question-content" style={{ paddingLeft: Math.min(depth, 3) * 8 }}>
            <span className="stage-copy-question-meta"><strong>{label}</strong><span>{QUESTION_CATEGORIES.find(category => category.id === categories.get(node.id))?.label ?? '자소서기반'}</span>{parentId && <span>꼬리질문</span>}</span>
            <strong className="stage-copy-question-title">{node.question || '아직 작성하지 않은 질문'}</strong>
            <span className="stage-copy-answer-preview">{node.answer || '아직 답변을 작성하지 않았어요.'}</span>
          </span>
        </label>)}
      </div>
      <footer className="stage-copy-footer">
        <button type="button" className="button button-outline" onClick={onClose}>취소</button>
        <button type="button" className="button button-primary" disabled={selectedIds.size === 0} onClick={() => { onCopy(selectedIds); onClose(); }}><Copy size={16} />선택한 질문 복사</button>
      </footer>
    </div>
  </div>, document.body);
}

export default function InterviewStages({ value, counts, nodes, onChange, onCopy, disabled = false }: InterviewStagesProps) {
  const tabs = useRef<HTMLDivElement>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const target = INTERVIEW_STAGES.find(stage => stage.id !== value)!;
  useEffect(() => { setCopyOpen(false); }, [value, disabled]);

  return <div className="interview-stages">
    <div ref={tabs} className="interview-stage-tabs" role="tablist" aria-label="면접 차수">
      {INTERVIEW_STAGES.map((stage, index) => <button key={stage.id} type="button" role="tab" aria-label={stage.label} aria-selected={value === stage.id}
        disabled={disabled} tabIndex={value === stage.id ? 0 : -1} className={value === stage.id ? 'active' : ''}
        onClick={() => onChange(stage.id)} onKeyDown={event => {
          if (disabled) return;
          const next = event.key === 'ArrowRight' ? (index + 1) % INTERVIEW_STAGES.length : event.key === 'ArrowLeft' ? (index + INTERVIEW_STAGES.length - 1) % INTERVIEW_STAGES.length : event.key === 'Home' ? 0 : event.key === 'End' ? INTERVIEW_STAGES.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); onChange(INTERVIEW_STAGES[next].id); tabs.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
        }}>{stage.label}<span aria-hidden="true">{counts[stage.id]}</span></button>)}
    </div>
    <button type="button" className="interview-stage-copy" disabled={disabled || nodes.length === 0} onClick={() => setCopyOpen(true)}><Copy size={16} />{target.label}으로 질문 복사</button>
    {copyOpen && <CopyQuestionsDialog nodes={nodes} targetLabel={target.label} onClose={() => setCopyOpen(false)} onCopy={onCopy} />}
  </div>;
}
