import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  BaseEdge, getBezierPath, Handle, Position, Panel, useNodesState, useReactFlow, useViewport,
  type Node, type NodeProps, type Edge, type EdgeProps,
} from '@xyflow/react';
import { ArrowUpRight, Check, FileText, Focus, GitBranch, ListOrdered, Minus, Plus, Quote, ScanLine } from 'lucide-react';
import type { Project, InterviewNode, QuestionCategory, QuestionCategoryFilter } from '../types';
import { getQuestionOutline, layoutQuestionRows, layoutTree } from '../lib/tree';
import { QUESTION_CATEGORIES } from '../lib/questionCategories';
import FormattedText from './FormattedText';
import './map.css';

interface InterviewMapProps {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (parentId: string | null, anchor: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  onPositionsChange: (positions: Record<string, { x: number; y: number }>) => void;
  filter: 'all' | 'draft' | 'ready';
  search: string;
  categoryFilter: QuestionCategoryFilter;
  categoryById: ReadonlyMap<string, QuestionCategory>;
}

type QuestionData = {
  node: InterviewNode;
  label: string;
  category: QuestionCategory;
  childCount: number;
  active: boolean;
  dimmed: boolean;
  onSelect: InterviewMapProps['onSelect'];
  onAdd: InterviewMapProps['onAdd'];
};
type QuestionFlowNode = Node<QuestionData, 'question'>;
type ResumeData = {
  project: Project;
  ready: number;
  count: number;
  categoryFilter: QuestionCategoryFilter;
  onAdd: InterviewMapProps['onAdd'];
};
type ResumeFlowNode = Node<ResumeData, 'resume'>;
type MapNode = QuestionFlowNode | ResumeFlowNode;

function QuestionCard({ data }: NodeProps<QuestionFlowNode>) {
  const { node, label, category, childCount, active, dimmed, onSelect, onAdd } = data;
  const categoryLabel = QUESTION_CATEGORIES.find(item => item.id === category)!.label;
  const [selection, setSelection] = useState('');
  const readSelection = useCallback((element: HTMLParagraphElement) => {
    const selected = window.getSelection();
    if (selected && element.contains(selected.anchorNode) && element.contains(selected.focusNode)) {
      setSelection(selected.toString().trim().slice(0, 300));
    } else setSelection('');
  }, []);
  return (
    <div
      className={`map-question-card${active ? ' is-active' : ''}${dimmed ? ' is-dimmed' : ''}${node.status === 'draft' ? ' is-draft' : ''}`}
      tabIndex={0}
      role="group"
      aria-label={`질문 ${label}: ${node.question || '새 질문'}`}
      onClick={() => { if (!window.getSelection()?.toString()) onSelect(node.id); }}
      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(node.id); } }}
    >
      <Handle type="target" position={Position.Left} className="map-handle" />
      <div className="map-card-top">
        <span className="map-question-number">{label}</span>
        <span className={`map-category-badge map-category-${category}`}>{categoryLabel}</span>
        <span className={`map-status ${node.status}`} title={node.status === 'ready' ? '준비 완료' : '작성 중'}>{node.status === 'ready' ? <Check size={11} /> : <span />}{node.status === 'ready' ? '준비 완료' : '작성 중'}</span>
      </div>
      <div className="map-anchor" title={node.anchor}><Quote size={11} /><span>{node.anchor || (category === 'resume' ? '연결할 표현을 선택해 주세요' : '주제·키워드 없이도 작성할 수 있어요')}</span></div>
      <button className="map-question-open nodrag" onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}>{node.question || '어떤 질문을 준비할까요?'}</button>
      <p
        className={`map-answer-preview nodrag nopan${!node.answer ? ' is-empty' : ''}`}
        onMouseUp={(event) => readSelection(event.currentTarget)}
        onTouchEnd={(event) => readSelection(event.currentTarget)}
        title={node.answer ? '답변 속 표현을 드래그하면 꼬리질문을 추가할 수 있어요.' : undefined}
      ><FormattedText text={node.answer || '나의 경험을 담아 답변을 작성해 보세요.'} formatting={node.answerFormatting} /></p>
      <div className="map-card-footer">
        <button
          className={`map-add-branch nodrag${selection ? ' has-selection' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            if (selection) { onAdd(node.id, selection); setSelection(''); window.getSelection()?.removeAllRanges(); }
            else onSelect(node.id);
          }}
          title={selection ? `‘${selection}’에서 꼬리질문 추가` : '답변을 열고 표현을 선택해 꼬리질문을 추가하세요'}
        ><Plus size={13} />{selection ? '선택한 표현으로 꼬리질문' : '꼬리질문 이어가기'}</button>
        {childCount > 0 ? <span className="map-child-count" title={`후속 질문 ${childCount}개`}><GitBranch size={12} />{childCount}</span> : <ArrowUpRight size={14} className="map-open-arrow" />}
      </div>
      <Handle type="source" position={Position.Right} className="map-handle" />
    </div>
  );
}

function ResumeCard({ data }: NodeProps<ResumeFlowNode>) {
  const { project, ready, count, categoryFilter, onAdd } = data;
  const category = QUESTION_CATEGORIES.find(item => item.id === categoryFilter);
  const title = categoryFilter === 'resume' ? '나의 이력서' : category?.label ?? '나의 면접 준비';
  const description = categoryFilter === 'resume'
    ? project.resume?.name || '이력서의 표현에서 질문을 연결해 보세요'
    : category?.description ?? '질문을 연결해 면접 흐름을 준비하세요';
  return (
    <div className="map-resume-card">
      <div className="map-resume-label"><span className="map-resume-icon"><FileText size={21} strokeWidth={1.6} /></span><span>{categoryFilter === 'resume' ? 'MY RESUME' : category?.label ?? 'INTERVIEW MAP'}</span><span className="map-resume-dot" /></div>
      <h3>{title}</h3>
      <p className={categoryFilter === 'resume' ? undefined : 'map-preparation-description'}>{description}</p>
      <div className="map-resume-stats"><span>질문 <b>{count}</b></span><span>준비 완료 <b>{ready}</b></span></div>
      <button className="map-resume-add nodrag" onClick={() => onAdd(null, '')}><Plus size={14} />질문 추가하기<ArrowUpRight size={14} /></button>
      <Handle type="source" position={Position.Right} className="map-handle map-root-handle" />
    </div>
  );
}

const nodeTypes = { question: QuestionCard, resume: ResumeCard };
const edgeStyle: CSSProperties = { stroke: '#a6beb2', strokeWidth: 1.5 };

/** Route a branching link above a row instead of through the cards it skips. */
function QuestionFlowEdge(props: EdgeProps) {
  const { getNode } = useReactFlow<MapNode>();
  const source = getNode(props.source);
  const target = getNode(props.target);
  const sameRow = source && target && Math.abs(source.position.y - target.position.y) < 1;
  let path: string;
  if (sameRow && props.targetX - props.sourceX > 350) {
    const lane = typeof props.data?.lane === 'number' ? props.data.lane : 0;
    const laneY = source.position.y - 40 - (lane % 3) * 12;
    const startX = props.sourceX + 24;
    const endX = props.targetX - 24;
    path = `M ${props.sourceX},${props.sourceY} H ${startX} V ${laneY} H ${endX} V ${props.targetY} H ${props.targetX}`;
  } else {
    [path] = getBezierPath(props);
  }
  return <BaseEdge id={props.id} path={path} style={props.style} markerEnd={props.markerEnd} interactionWidth={props.interactionWidth} />;
}

const edgeTypes = { questionFlow: QuestionFlowEdge };

function MapControls({ onAutoArrange, arrangeDisabled }: { onAutoArrange: () => void; arrangeDisabled: boolean }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  return (
    <Panel position="bottom-left" className="map-controls">
      <button onClick={() => zoomOut({ duration: 180 })} aria-label="마인드맵 축소"><Minus size={16} /></button>
      <span aria-label="현재 배율">{Math.round(zoom * 100)}<small>%</small></span>
      <button onClick={() => zoomIn({ duration: 180 })} aria-label="마인드맵 확대"><Plus size={16} /></button>
      <i />
      <button onClick={() => fitView({ padding: 0.16, duration: 350, maxZoom: 0.9 })} aria-label="마인드맵 전체 보기" title="전체 보기"><Focus size={17} /></button>
      <i />
      <button className="map-auto-arrange" onClick={onAutoArrange} disabled={arrangeDisabled} aria-label="마인드맵 자동정렬" title="현재 분야의 질문을 번호순으로 정렬하고 위치 저장"><ListOrdered size={17} /><span>자동정렬</span></button>
    </Panel>
  );
}

function MapContent({ project, selectedId, onSelect, onAdd, onPositionChange, onPositionsChange, filter, search, categoryFilter, categoryById }: InterviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);
  const { getNode, getNodes, getViewport, setViewport, fitView } = useReactFlow<MapNode>();
  const autoFitFrame = useRef<number | undefined>(undefined);
  const visibleNodes = useMemo(() => project.nodes.filter(node => categoryFilter === 'all'
    || (categoryById.get(node.id) ?? 'resume') === categoryFilter), [project.nodes, categoryFilter, categoryById]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map(node => node.id)), [visibleNodes]);
  const positions = useMemo(() => layoutTree(visibleNodes), [visibleNodes]);
  const labels = useMemo(() => new Map(getQuestionOutline(project.nodes).map((entry) => [entry.node.id, entry.label])), [project.nodes]);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const initialNodes = useMemo<MapNode[]>(() => {
    const query = search.trim().toLocaleLowerCase();
    const root: ResumeFlowNode = {
      id: 'resume-root', type: 'resume', position: positions['resume-root'] || { x: 0, y: 0 }, draggable: false,
      data: { project, count: visibleNodes.length, ready: visibleNodes.filter((node) => node.status === 'ready').length, categoryFilter, onAdd },
    };
    return [root, ...visibleNodes.map((node, index): QuestionFlowNode => ({
      id: node.id,
      type: 'question',
      position: node.position || positions[node.id] || { x: 390, y: index * 350 },
      selected: node.id === selectedId,
      data: {
        node, label: labels.get(node.id)!, category: categoryById.get(node.id) ?? 'resume', active: node.id === selectedId,
        childCount: visibleNodes.filter((candidate) => candidate.parentId === node.id).length,
        dimmed: (filter !== 'all' && node.status !== filter) || (!!query && !`${node.question} ${node.answer} ${node.anchor}`.toLocaleLowerCase().includes(query)),
        onSelect, onAdd,
      },
    }))];
  }, [project, visibleNodes, positions, labels, selectedId, onSelect, onAdd, filter, search, categoryFilter, categoryById]);
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(initialNodes);
  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
  useEffect(() => () => { if (autoFitFrame.current !== undefined) cancelAnimationFrame(autoFitFrame.current); }, [categoryFilter]);

  function autoArrange() {
    if (!initialized || visibleNodes.length === 0) return;
    const sizes = Object.fromEntries(getNodes().map(node => [node.id, {
      width: node.measured?.width ?? (node.id === 'resume-root' ? 260 : 320),
      height: node.measured?.height ?? (node.id === 'resume-root' ? 320 : 400),
    }]));
    const rows = layoutQuestionRows(visibleNodes, sizes);
    const root = positionsRef.current['resume-root'] ?? { x: 0, y: 0 };
    const offset = { x: root.x - rows['resume-root'].x, y: root.y - rows['resume-root'].y };
    const updates: Record<string, { x: number; y: number }> = {};
    for (const node of visibleNodes) {
      updates[node.id] = { x: rows[node.id].x + offset.x, y: rows[node.id].y + offset.y };
    }
    onSelect(null);
    setNodes(current => current.map(node => updates[node.id] ? { ...node, position: updates[node.id], selected: false } : { ...node, selected: false }));
    onPositionsChange(updates);
    if (autoFitFrame.current !== undefined) cancelAnimationFrame(autoFitFrame.current);
    autoFitFrame.current = requestAnimationFrame(() => {
      autoFitFrame.current = requestAnimationFrame(() => {
        autoFitFrame.current = undefined;
        void fitView({ padding: 0.16, duration: 350, maxZoom: 0.9 });
      });
    });
  }
  useEffect(() => {
    if (!initialized) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) return;
        const root = positionsRef.current['resume-root'] || { x: 0, y: 0 };
        const zoom = bounds.width < 600 ? 0.66 : 0.72;
        // Start close enough to read. The fit control remains available for the full tree.
        void setViewport({
          x: 40 - root.x * zoom,
          y: bounds.height / 2 - (root.y + 160) * zoom,
          zoom,
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialized, setViewport, categoryFilter]);
  const focusSelected = useCallback(() => {
    if (!selectedId) return;
    const bounds = containerRef.current?.getBoundingClientRect();
    const node = getNode(selectedId);
    if (!bounds || !node) return;
    const zoom = Math.max(0.65, getViewport().zoom);
    const position = node.position || positionsRef.current[selectedId];
    const width = node.measured?.width || 320;
    const height = node.measured?.height || 310;
    void setViewport({
      x: bounds.width / 2 - (position.x + width / 2) * zoom,
      y: bounds.height / 2 - (position.y + height / 2) * zoom,
      zoom,
    }, { duration: 260 });
  }, [selectedId, getNode, getViewport, setViewport]);
  useEffect(() => {
    if (!initialized || !selectedId) return;
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(focusSelected); });
    // The editor can resize the canvas after selection; follow that size change too.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(focusSelected);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [initialized, selectedId, focusSelected]);
  const edges = useMemo<Edge[]>(() => visibleNodes.map((node, index) => ({
    id: `edge-${node.id}`, source: node.parentId && visibleIds.has(node.parentId) ? node.parentId : 'resume-root', target: node.id,
    type: node.parentId && visibleIds.has(node.parentId) ? 'questionFlow' : 'default', style: edgeStyle, data: { lane: index },
  })), [visibleNodes, visibleIds]);
  return (
    <div className="interview-map" aria-label="면접 질문 마인드맵" ref={containerRef}>
      <ReactFlow<MapNode, Edge>
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => { if (node.id !== 'resume-root') onPositionChange(node.id, node.position); }}
        onPaneClick={() => onSelect(null)}
        onInit={() => setInitialized(true)}
        nodesConnectable={false} deleteKeyCode={null}
        minZoom={0.15} maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ style: edgeStyle }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.1} color="#d9dfd6" />
        <Panel position="top-left" className="map-canvas-label"><span />생각을 연결하는 공간</Panel>
        {visibleNodes.length === 0 && <Panel position="top-center" className="map-first-hint"><ScanLine size={16} /><span>{categoryFilter === 'resume' ? '이력서의 표현을 선택하거나 질문 추가로 첫 질문을 작성하세요.' : '질문 추가를 눌러 첫 질문을 작성하세요. 이력서 없이도 준비할 수 있어요.'}</span></Panel>}
        <MapControls onAutoArrange={autoArrange} arrangeDisabled={!initialized || visibleNodes.length === 0} />
        <Panel position="bottom-right" className="map-legend"><span><i className="ready" />준비 완료</span><span><i className="draft" />작성 중</span></Panel>
      </ReactFlow>
    </div>
  );
}

export default function InterviewMap(props: InterviewMapProps) {
  return <ReactFlowProvider key={props.project.id}><MapContent {...props} /></ReactFlowProvider>;
}
