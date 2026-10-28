import { useEffect, useState, type SyntheticEvent } from 'react';
import { Check, CheckCheck, ChevronRight, GitBranch, Link2, MessageSquareText, Quote, Trash2, X } from 'lucide-react';
import type { InterviewNode } from '../types';
import './editor.css';

interface QuestionEditorProps {
  node: InterviewNode;
  parent: InterviewNode | null;
  onChange: (patch: Partial<InterviewNode>) => void;
  onClose: () => void;
  onAddChild: (anchor: string) => void;
  onDelete: () => void;
}

export default function QuestionEditor({ node, parent, onChange, onClose, onAddChild, onDelete }: QuestionEditorProps) {
  const [selection, setSelection] = useState('');
  const canComplete = Boolean(node.question.trim() && node.answer.trim());

  useEffect(() => { setSelection(''); }, [node.id]);

  function captureSelection(event: SyntheticEvent<HTMLTextAreaElement>) {
    const field = event.currentTarget;
    setSelection(field.value.slice(field.selectionStart, field.selectionEnd).trim());
  }

  function updateText(field: 'question' | 'answer', value: string) {
    if (field === 'answer') setSelection('');
    onChange({ [field]: value, ...(!value.trim() && node.status === 'ready' ? { status: 'draft' as const } : {}) });
  }

  return (
    <aside className="editor-panel" aria-label="질문 편집">
      <header className="editor-header">
        <div>
          <span className="editor-eyebrow">QUESTION NOTE</span>
          <h2>질문 다듬기<span className="editor-title-dot" /></h2>
        </div>
        <button className="editor-close" onClick={onClose} aria-label="질문 편집 닫기" title="닫기"><X size={19} /></button>
      </header>

      <div className="editor-body">
        <div className="editor-origin">
          <div className="editor-origin-breadcrumb"><Link2 size={13} /><span>{parent ? '이전 답변' : '이력서'}</span><ChevronRight size={12} /><span>이 질문</span></div>
          {parent && <p className="editor-parent-question" title={parent.question}><Quote size={12} />{parent.question || '아직 작성하지 않은 질문'}</p>}
          <label className="editor-field-label editor-anchor-label" htmlFor="editor-anchor">연결된 키워드</label>
          <input id="editor-anchor" className="editor-anchor-input" value={node.anchor} onChange={event => onChange({ anchor: event.target.value })} placeholder="질문의 출발점이 되는 표현" />
        </div>

        <div className="editor-field">
          <label className="editor-field-label" htmlFor="editor-question"><span className="editor-label-icon"><MessageSquareText size={14} />예상 질문</span><span className="editor-field-number" aria-hidden="true">01</span></label>
          <textarea id="editor-question" aria-label="예상 질문" className="editor-textarea editor-question" value={node.question} onChange={event => updateText('question', event.target.value)} placeholder="면접관이라면 어떤 질문을 할까요?" rows={3} />
        </div>

        <div className="editor-field editor-answer-field">
          <label className="editor-field-label" htmlFor="editor-answer"><span>나의 답변</span><span className="editor-field-number" aria-hidden="true">02</span></label>
          <textarea id="editor-answer" aria-label="나의 답변" className="editor-textarea editor-answer" value={node.answer} onChange={event => updateText('answer', event.target.value)} onSelect={captureSelection} placeholder={'경험과 생각을 나만의 언어로 정리해 보세요.\n\n답변의 표현을 드래그하면 꼬리질문을 연결할 수 있어요.'} rows={8} />
          <div className="editor-branch-hint"><GitBranch size={14} /><span>답변에서 문구를 드래그해 다음 질문을 연결하세요.</span></div>

          {selection ? <button className="editor-add-branch" onMouseDown={event => event.preventDefault()} onClick={() => { if (selection.trim()) onAddChild(selection.trim()); }} aria-label={`“${selection}”에서 꼬리질문 추가`}><span className="editor-add-branch-icon"><GitBranch size={17} /></span><span className="editor-add-branch-copy"><span className="editor-selected-quote">“{selection}”</span><strong>이 표현에서 꼬리질문 추가</strong></span><span className="editor-add-branch-plus">+</span></button> : <div className="editor-branch-placeholder"><span className="editor-branch-placeholder-line" /><GitBranch size={17} /><span>좋은 질문은 답변에서 이어져요</span></div>}
        </div>

        <div className={node.status === 'ready' ? 'editor-completion editor-completion-done' : 'editor-completion'}>
          <label className="editor-completion-label">
            <input type="checkbox" checked={node.status === 'ready'} disabled={!canComplete} onChange={event => onChange({ status: event.target.checked ? 'ready' : 'draft' })} />
            <span className="editor-completion-check"><Check size={13} /></span>
            <span><strong>준비 완료로 표시</strong><span className="editor-completion-description">{canComplete ? '이 질문에 자신 있게 답할 수 있어요.' : '질문과 답변을 작성하면 표시할 수 있어요.'}</span></span>
          </label>
        </div>
      </div>

      <footer className="editor-footer">
        <button className="editor-delete" onClick={onDelete} aria-label="질문과 하위 질문 삭제"><Trash2 size={14} />질문 삭제</button>
        <span className="editor-autosave"><CheckCheck size={14} />자동 저장</span>
      </footer>
    </aside>
  );
}
