import { useEffect, useRef } from 'react';
import { ChevronRight, FileText, GitBranch, Search } from 'lucide-react';
import type { InterviewNode } from '../types';
import type { QuestionOutlineEntry } from '../lib/tree';
import './question-list.css';

interface QuestionListProps {
  outline: QuestionOutlineEntry[];
  selectedId: string | null;
  filter: 'all' | InterviewNode['status'];
  search: string;
  onSelect: (id: string) => void;
}

export default function QuestionList({ outline, selectedId, filter, search, onSelect }: QuestionListProps) {
  const container = useRef<HTMLDivElement>(null);
  const byId = new Map(outline.map((entry) => [entry.node.id, entry]));
  const query = search.trim().toLocaleLowerCase();
  const visible = outline.filter(({ node }) => (filter === 'all' || node.status === filter)
    && (!query || `${node.anchor} ${node.question} ${node.answer}`.toLocaleLowerCase().includes(query)));

  useEffect(() => {
    container.current?.querySelector('.question-list-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return <div className="question-list" ref={container}>
    <div className="list-heading">
      <div><p className="eyebrow">YOUR QUESTION LIBRARY</p><h2>차곡차곡 쌓인 질문들 <span>{visible.length}</span></h2></div>
      <span>질문을 눌러 답변을 다듬어 보세요.</span>
    </div>
    <p className="list-number-guide">앞 번호는 질문 묶음, 뒤 번호는 묶음 안의 순서예요.</p>
    {visible.length ? visible.map(({ node, label, parentId, depth }, index) => {
      const parent = parentId ? byId.get(parentId) : undefined;
      const startsGroup = index === 0 || label.split('-')[0] !== visible[index - 1].label.split('-')[0];
      return <button key={node.id} data-question-id={node.id} style={{ paddingLeft: `${15 + Math.min(depth, 3) * 12}px` }}
        className={`question-list-item${selectedId === node.id ? ' selected' : ''}${startsGroup ? ' list-group-start' : ''}${parent ? ' list-follow-up' : ''}`}
        onClick={() => onSelect(node.id)}>
        <span className="list-number">{label}</span>
        <div>
          {parent && <div className="list-question-path" aria-label={`연결 흐름 ${parent.label} → ${label}`}>
            <span>부모 {parent.label}</span><ChevronRight size={13} aria-hidden="true" /><span>{label}</span>
          </div>}
          <div className="list-item-meta"><span>{parent ? <GitBranch size={12} /> : <FileText size={12} />}{node.anchor || '연결 키워드 없음'}</span></div>
          <strong>{node.question || '새로운 질문을 작성해 주세요'}</strong>
          <p>{node.answer || '아직 답변을 작성하지 않았어요.'}</p>
        </div>
        <span className={`list-status ${node.status}`}><span />{node.status === 'ready' ? '준비 완료' : '작성 중'}</span>
        <ChevronRight size={17} />
      </button>;
    }) : <div className="list-empty"><Search size={28} /><h3>{query || filter !== 'all' ? '일치하는 질문이 없어요' : '첫 질문을 연결해 보세요'}</h3><p>{query || filter !== 'all' ? '검색어나 상태 필터를 변경해 주세요.' : '이력서의 문구를 선택하면 나만의 질문이 시작돼요.'}</p></div>}
  </div>;
}
