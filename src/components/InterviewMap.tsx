import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant,
  Handle, Position, Panel, useNodesState, useReactFlow, useViewport,
  type Node, type NodeProps, type Edge,
} from '@xyflow/react';
import { ArrowUpRight, Check, FileText, Focus, GitBranch, Minus, Plus, Quote, ScanLine } from 'lucide-react';
import type { Project, InterviewNode } from '../types';
import { getQuestionOutline, layoutTree } from '../lib/tree';
import './map.css';

interface InterviewMapProps {
  project: Project;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (parentId: string | null, anchor: string) => void;
  onPositionChange: (id: string, position: { x: number; y: number }) => void;
  filter: 'all' | 'draft' | 'ready';
  search: string;
}

type QuestionData = {
  node: InterviewNode;
  label: string;
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
  onAdd: InterviewMapProps['onAdd'];
};
type ResumeFlowNode = Node<ResumeData, 'resume'>;
type MapNode = QuestionFlowNode | ResumeFlowNode;

function QuestionCard({ data }: NodeProps<QuestionFlowNode>) {
  const { node, label, childCount, active, dimmed, onSelect, onAdd } = data;
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
        <span className={`map-status ${node.status}`} title={node.status === 'ready' ? '준비 완료' : '작성 중'}>{node.status === 'ready' ? <Check size={11} /> : <span />}{node.status === 'ready' ? '준비 완료' : '작성 중'}</span>
      </div>
      <div className="map-anchor" title={node.anchor}><Quote size={11} /><span>{node.anchor || '연결할 표현을 선택해 주세요'}</span></div>
      <button className="map-question-open nodrag" onClick={(event) => { event.stopPropagation(); onSelect(node.id); }}>{node.question || '어떤 질문을 준비할까요?'}</button>
      <p
        className={`map-answer-preview nodrag nopan${!node.answer ? ' is-empty' : ''}`}
        onMouseUp={(event) => readSelection(event.currentTarget)}
        onTouchEnd={(event) => readSelection(event.currentTarget)}
        title={node.answer ? '답변 속 표현을 드래그하면 꼬리질문을 추가할 수 있어요.' : undefined}
      >{node.answer || '나의 경험을 담아 답변을 작성해 보세요.'}</p>
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
  const { project, ready, onAdd } = data;
  return (
    <div className="map-resume-card">
      <div className="map-resume-label"><span className="map-resume-icon"><FileText size={21} strokeWidth={1.6} /></span><span>MY RESUME</span><span className="map-resume-dot" /></div>
      <h3>모든 질문의 시작,<br />나의 이력서</h3>
      <p>{project.resume?.name || '이력서를 업로드해 주세요'}</p>
      <div className="map-resume-stats"><span>연결된 질문 <b>{project.nodes.length}</b></span><span>준비 완료 <b>{ready}</b></span></div>
      <button className="map-resume-add nodrag" onClick={() => onAdd(null, '')}><Plus size={14} />첫 질문 연결하기<ArrowUpRight size={14} /></button>
      <Handle type="source" position={Position.Right} className="map-handle map-root-handle" />
    </div>
  );
}

const nodeTypes = { question: QuestionCard, resume: ResumeCard };
const edgeStyle: CSSProperties = { stroke: '#a6beb2', strokeWidth: 1.5 };

function MapControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  return (
    <Panel position="bottom-left" className="map-controls">
      <button onClick={() => zoomOut({ duration: 180 })} aria-label="마인드맵 축소"><Minus size={16} /></button>
      <span aria-label="현재 배율">{Math.round(zoom * 100)}<small>%</small></span>
      <button onClick={() => zoomIn({ duration: 180 })} aria-label="마인드맵 확대"><Plus size={16} /></button>
      <i />
      <button onClick={() => fitView({ padding: 0.16, duration: 350, maxZoom: 0.9 })} aria-label="마인드맵 전체 보기" title="전체 보기"><Focus size={17} /></button>
    </Panel>
  );
}

function MapContent({ project, selectedId, onSelect, onAdd, onPositionChange, filter, search }: InterviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);
  const { getNode, getViewport, setViewport } = useReactFlow<MapNode>();
  const positions = useMemo(() => layoutTree(project.nodes), [project.nodes]);
  const labels = useMemo(() => new Map(getQuestionOutline(project.nodes).map((entry) => [entry.node.id, entry.label])), [project.nodes]);
  const positionsRef = useRef(positions);
  positionsRef.current = positions;
  const initialNodes = useMemo<MapNode[]>(() => {
    const query = search.trim().toLocaleLowerCase();
    const root: ResumeFlowNode = {
      id: 'resume-root', type: 'resume', position: positions['resume-root'] || { x: 0, y: 0 }, draggable: false,
      data: { project, ready: project.nodes.filter((node) => node.status === 'ready').length, onAdd },
    };
    return [root, ...project.nodes.map((node, index): QuestionFlowNode => ({
      id: node.id,
      type: 'question',
      position: node.position || positions[node.id] || { x: 390, y: index * 350 },
      selected: node.id === selectedId,
      data: {
        node, label: labels.get(node.id)!, active: node.id === selectedId,
        childCount: project.nodes.filter((candidate) => candidate.parentId === node.id).length,
        dimmed: (filter !== 'all' && node.status !== filter) || (!!query && !`${node.question} ${node.answer} ${node.anchor}`.toLocaleLowerCase().includes(query)),
        onSelect, onAdd,
      },
    }))];
  }, [project, positions, labels, selectedId, onSelect, onAdd, filter, search]);
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(initialNodes);
  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
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
  }, [initialized, setViewport]);
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
  const edges = useMemo<Edge[]>(() => project.nodes.map((node) => ({
    id: `edge-${node.id}`, source: node.parentId || 'resume-root', target: node.id,
    type: 'default', style: edgeStyle,
  })), [project.nodes]);
  return (
    <div className="interview-map" aria-label="면접 질문 마인드맵" ref={containerRef}>
      <ReactFlow<MapNode, Edge>
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
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
        {project.nodes.length === 0 && <Panel position="top-center" className="map-first-hint"><ScanLine size={16} /><span>왼쪽 이력서에서 표현을 선택해 첫 질문을 연결해 보세요.</span></Panel>}
        <MapControls />
        <Panel position="bottom-right" className="map-legend"><span><i className="ready" />준비 완료</span><span><i className="draft" />작성 중</span></Panel>
      </ReactFlow>
    </div>
  );
}

export default function InterviewMap(props: InterviewMapProps) {
  return <ReactFlowProvider key={props.project.id}><MapContent {...props} /></ReactFlowProvider>;
}
