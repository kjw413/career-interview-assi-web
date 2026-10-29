import { useEffect, useRef, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useSensor, useSensors, type DragEndEvent, type KeyboardCoordinateGetter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, FileText, GitBranch, GripVertical, Search } from 'lucide-react';
import type { InterviewNode } from '../types';
import type { QuestionOutlineEntry } from '../lib/tree';
import FormattedText from './FormattedText';
import './question-list.css';

interface QuestionListProps {
  outline: QuestionOutlineEntry[];
  selectedId: string | null;
  filter: 'all' | InterviewNode['status'];
  search: string;
  onSelect: (id: string) => void;
  onReorder: (sourceId: string, targetId: string, placement: 'before' | 'after') => void;
}

interface QuestionGroup {
  root: QuestionOutlineEntry;
  entries: QuestionOutlineEntry[];
  childCount: number;
}

function SortableQuestionGroup({ group, byId, selectedId, disabled, disabledReason, onSelect }: {
  group: QuestionGroup;
  byId: Map<string, QuestionOutlineEntry>;
  selectedId: string | null;
  disabled: boolean;
  disabledReason: string;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: group.root.node.id, disabled });
  const groupNumber = group.root.label.split('-')[0];
  return <section ref={setNodeRef} className={`question-list-group${isDragging ? ' is-dragging' : ''}`}
    data-question-group={group.root.node.id} style={{ transform: CSS.Transform.toString(transform), transition }}
    aria-label={`질문 묶음 ${groupNumber}`}>
    {group.entries.map(({ node, label, parentId, depth }, index) => {
      const parent = parentId ? byId.get(parentId) : undefined;
      return <div key={node.id} data-question-id={node.id} style={{ paddingLeft: `${15 + Math.min(depth, 3) * 12}px` }}
        className={`question-list-item${selectedId === node.id ? ' selected' : ''}${index === 0 ? ' list-group-start' : ''}${parent ? ' list-follow-up' : ''}`}>
        {parentId === null ? <button ref={setActivatorNodeRef} type="button" className="list-drag-handle" disabled={disabled}
          {...attributes} {...listeners} aria-label={`질문 묶음 ${groupNumber} 순서 변경`}
          title={disabled ? disabledReason : '드래그하여 묶음 이동 · 스페이스로 잡고 방향키로 이동'} onClick={event => event.stopPropagation()}>
          <GripVertical size={17} aria-hidden="true" /><span className="list-number">{label}</span>
        </button> : <span className="list-number" title="연결된 질문의 순서는 고정돼요.">{label}</span>}
        <button type="button" className="list-question-open" onClick={() => onSelect(node.id)}>
          <span className="list-question-copy">
            {parent && <span className="list-question-path" aria-label={`연결 흐름 ${parent.label} → ${label}`}>
              <span>부모 {parent.label}</span><ChevronRight size={13} aria-hidden="true" /><span>{label}</span>
            </span>}
            <span className="list-item-meta"><span>{parent ? <GitBranch size={12} /> : <FileText size={12} />}{node.anchor || '연결 키워드 없음'}</span></span>
            <strong>{node.question || '새로운 질문을 작성해 주세요'}</strong>
            <span className="list-answer-preview"><FormattedText text={node.answer || '아직 답변을 작성하지 않았어요.'} formatting={node.answerFormatting} /></span>
          </span>
          <span className={`list-status ${node.status}`}><span />{node.status === 'ready' ? '준비 완료' : '작성 중'}</span>
          <ChevronRight size={17} />
        </button>
      </div>;
    })}
  </section>;
}

export default function QuestionList({ outline, selectedId, filter, search, onSelect, onReorder }: QuestionListProps) {
  const container = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const byId = new Map(outline.map((entry) => [entry.node.id, entry]));
  const query = search.trim().toLocaleLowerCase();
  const isFiltered = filter !== 'all' || Boolean(query);
  const groups: QuestionGroup[] = [];
  for (const entry of outline) {
    if (entry.parentId === null) groups.push({ root: entry, entries: [], childCount: 0 });
    const group = groups[groups.length - 1];
    if (entry.parentId !== null) group.childCount += 1;
    if ((filter === 'all' || entry.node.status === filter)
      && (!query || `${entry.node.anchor} ${entry.node.question} ${entry.node.answer}`.toLocaleLowerCase().includes(query))) group.entries.push(entry);
  }
  const visibleGroups = groups.filter(group => group.entries.length > 0);
  const visibleCount = visibleGroups.reduce((sum, group) => sum + group.entries.length, 0);
  const disabled = isFiltered || groups.length < 2;
  const disabledReason = isFiltered ? '검색·상태 필터를 해제하면 순서를 바꿀 수 있어요.' : '이동할 다른 질문 묶음이 없어요.';
  const activeGroup = groups.find(group => group.root.node.id === activeId);
  const groupIds = visibleGroups.map(group => group.root.node.id);
  const keyboardTarget = useRef<string | null>(null);
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.code) || !keyboardTarget.current) return;
    event.preventDefault();
    const currentIndex = groupIds.indexOf(keyboardTarget.current);
    const nextIndex = Math.max(0, Math.min(groupIds.length - 1, currentIndex + (event.code === 'ArrowDown' ? 1 : -1)));
    const nextId = groupIds[nextIndex];
    keyboardTarget.current = nextId;
    const rect = context.droppableRects.get(nextId);
    if (!rect || !context.collisionRect) return currentCoordinates;
    // Align centers so tall question flows and short flows share the same drop target.
    return { x: rect.left + (rect.width - context.collisionRect.width) / 2,
      y: rect.top + (rect.height - context.collisionRect.height) / 2 };
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates, scrollBehavior: 'auto' }));
  const groupName = (id: string | number) => `질문 묶음 ${byId.get(String(id))?.label.split('-')[0] ?? ''}`;

  useEffect(() => {
    container.current?.querySelector('.question-list-item.selected')?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  useEffect(() => {
    if (!activeId) return;
    // Let the drag sensor cancel first without also exiting expanded workspace mode.
    const cancelKey = (event: KeyboardEvent) => { if (event.key === 'Escape') event.preventDefault(); };
    document.addEventListener('keydown', cancelKey, true);
    return () => document.removeEventListener('keydown', cancelKey, true);
  }, [activeId]);

  function finishDrag({ active, over }: DragEndEvent) {
    setActiveId(null);
    const targetId = keyboardTarget.current ?? (over ? String(over.id) : null);
    keyboardTarget.current = null;
    if (disabled || !targetId || active.id === targetId) return;
    const sourceIndex = groupIds.indexOf(String(active.id));
    const targetIndex = groupIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    onReorder(String(active.id), targetId, sourceIndex < targetIndex ? 'after' : 'before');
  }

  return <div className="question-list" ref={container}>
    <div className="list-heading">
      <div><p className="eyebrow">YOUR QUESTION LIBRARY</p><h2>차곡차곡 쌓인 질문들 <span>{visibleCount}</span></h2></div>
      <span>질문을 눌러 답변을 다듬어 보세요.</span>
    </div>
    <p className="list-number-guide">앞 번호는 질문 묶음, 뒤 번호는 묶음 안의 순서예요.</p>
    {outline.length > 0 && <p className="list-reorder-guide">{isFiltered ? disabledReason : '첫 질문의 번호를 드래그하면 연결된 질문 묶음이 함께 이동해요. 묶음 안의 순서는 고정돼요.'}</p>}
    {visibleCount ? <DndContext sensors={sensors} collisionDetection={args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)} onDragStart={({ active, activatorEvent }) => { keyboardTarget.current = activatorEvent instanceof KeyboardEvent ? String(active.id) : null; setActiveId(String(active.id)); }}
      onDragEnd={finishDrag} onDragCancel={() => { keyboardTarget.current = null; setActiveId(null); }} accessibility={{
        screenReaderInstructions: { draggable: '스페이스 키로 질문 묶음을 잡고 위아래 방향키로 이동한 뒤 스페이스 키로 놓으세요. Esc 키로 취소합니다. 연결된 질문은 함께 이동하며 묶음 안의 순서는 바뀌지 않습니다.' },
        announcements: {
          onDragStart: ({ active }) => `${groupName(active.id)}을 잡았습니다. 연결된 질문도 함께 이동합니다.`,
          onDragOver: ({ active, over }) => over && active.id !== over.id ? `${groupName(over.id)} 위치로 이동합니다.` : undefined,
          onDragEnd: ({ active, over }) => over && active.id !== over.id ? `${groupName(active.id)}의 순서를 변경했습니다.` : '질문 묶음 순서를 유지했습니다.',
          onDragCancel: () => '질문 묶음 이동을 취소했습니다.',
        },
      }}>
      <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
        {visibleGroups.map(group => <SortableQuestionGroup key={group.root.node.id} group={group} byId={byId} selectedId={selectedId}
          disabled={disabled} disabledReason={disabledReason} onSelect={onSelect} />)}
      </SortableContext>
      <DragOverlay dropAnimation={null}>{activeGroup && <div className="list-drag-overlay">
        <span className="list-drag-overlay-label"><GripVertical size={17} />{activeGroup.root.label}</span>
        <strong>{activeGroup.root.node.question || '새로운 질문'}</strong>
        <span>{activeGroup.childCount ? `연결된 꼬리질문 ${activeGroup.childCount}개와 함께 이동` : '질문 묶음 이동'}</span>
      </div>}</DragOverlay>
    </DndContext> : <div className="list-empty"><Search size={28} /><h3>{isFiltered ? '일치하는 질문이 없어요' : '첫 질문을 연결해 보세요'}</h3><p>{isFiltered ? '검색어나 상태 필터를 변경해 주세요.' : '이력서의 문구를 선택하면 나만의 질문이 시작돼요.'}</p></div>}
  </div>;
}
