import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCheck,
  CheckCircle2, ChevronDown, ChevronRight, CircleHelp, FileText, FolderOpen, GitBranch,
  LogOut, RefreshCw, LayoutGrid, List, LoaderCircle, LockKeyhole, MoreHorizontal, PanelLeftClose,
  PanelLeftOpen, Plus, Search, Settings2, Sparkles, Trash2, Upload, X, Maximize2, Minimize2,
} from 'lucide-react';
import type { InterviewNode, Project } from './types';
import { createNode, createProject, getStats, getSubtreeIds } from './lib/tree';
import { localStore, type ProjectStore } from './lib/projectStore';
import { cloudConfig } from './lib/supabase';
import { recoveryDrafts, clearDraft } from './lib/recovery';
import CloudAccount, { CloudSetupError } from './components/CloudAccount';
import { parseProjectBackup, serializeProject } from './lib/backup';
import InterviewMap from './components/InterviewMap';
import QuestionEditor from './components/QuestionEditor';

const EMPTY_PROJECTS: Project[] = [];
type Confirm = { title: string; description: string; action: () => void; label?: string };
type Selection = { text: string; x: number; y: number };

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Modal({ children, onClose, title, wide = false, className = '', showClose = true, initialFocus }: { children: ReactNode; onClose: () => void; title: string; wide?: boolean; className?: string; showClose?: boolean; initialFocus?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = panel.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, [tabindex="0"]') ?? []);
    (initialFocus ? dialog?.querySelector<HTMLElement>(initialFocus) : focusable()[0])?.focus();
    const key = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key === 'Tab') {
        const els = focusable();
        if (!els.length) return;
        if (event.shiftKey && document.activeElement === els[0]) { event.preventDefault(); els.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === els.at(-1)) { event.preventDefault(); els[0].focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={panel} className={`modal ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      {showClose && <button className="icon-button modal-close" onClick={onClose} aria-label="닫기"><X size={20} /></button>}
      {children}
    </div>
  </div>;
}

function ProjectForm({ project, onClose, onSubmit }: { project?: Project; onClose: () => void; onSubmit: (company: string, role: string) => void }) {
  const [company, setCompany] = useState(project?.company ?? '');
  const [role, setRole] = useState(project?.role ?? '');
  function submit(event: FormEvent) { event.preventDefault(); if (company.trim() && role.trim()) onSubmit(company.trim(), role.trim()); }
  return <Modal onClose={onClose} title={project ? '지원 정보 수정' : '새 지원서 만들기'}>
    <div className="modal-symbol"><FolderOpen size={25} /></div>
    <p className="eyebrow">A NEW CHAPTER</p>
    <h2>{project ? '지원 정보를 수정하세요' : '다음 기회를 준비해 볼까요?'}</h2>
    <p className="modal-description">지원처마다 이력서와 면접 준비를 따로 관리할 수 있어요.</p>
    <form onSubmit={submit}>
      <label className="form-label" htmlFor="company">지원 기업</label>
      <input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="예: 토스" maxLength={80} required autoComplete="organization" />
      <label className="form-label" htmlFor="role">지원 직무</label>
      <input id="role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="예: 프론트엔드 개발자" maxLength={120} required />
      <button className="button button-primary form-submit" disabled={!company.trim() || !role.trim()}>{project ? '변경 사항 저장' : '지원서 만들기'}<ArrowRight size={17} /></button>
    </form>
  </Modal>;
}

function SelectionText({ text, nodes, onSelect }: { text: string; nodes: InterviewNode[]; onSelect: (selection: Selection | null) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const anchors = [...new Set(nodes.filter((n) => n.parentId === null).map((n) => n.anchor).filter(Boolean))].sort((a, b) => b.length - a.length);
  function select() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed || !container.current?.contains(selection.anchorNode) || !container.current.contains(selection.focusNode)) { onSelect(null); return; }
    const picked = selection.toString().trim();
    if (!picked || picked.length > 500) { onSelect(null); return; }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    onSelect({ text: picked, x: Math.max(12, Math.min(rect.left, window.innerWidth - 250)), y: Math.max(12, rect.top - 48) });
  }
  function highlight(line: string): ReactNode[] {
    if (!anchors.length) return [line];
    const pattern = new RegExp(`(${anchors.map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return line.split(pattern).map((part, index) => anchors.includes(part) ? <mark key={index} title="질문이 연결된 표현">{part}</mark> : part);
  }
  const lines = text.split('\n');
  const headings = ['경력', '주요 프로젝트', '기술 역량', '학력', '특기사항', '자기소개', '자격증', '경험', '프로젝트', '교육', '수상', '보유 기술'];
  return <div className="resume-document" ref={container} onMouseUp={select} onKeyUp={select} onTouchEnd={() => setTimeout(select, 100)} tabIndex={0} aria-label="이력서 텍스트. 문구를 선택하면 질문을 추가할 수 있습니다.">
    {lines.map((line, i) => line.trim() === '' ? <div className="document-gap" key={i} /> : <p key={i} className={i === 0 ? 'document-name' : i === 1 ? 'document-role' : headings.includes(line.trim()) ? 'document-heading' : ''}>{highlight(line)}</p>)}
  </div>;
}

export default function App() {
  if (cloudConfig.mode === 'invalid') return <CloudSetupError />;
  if (cloudConfig.mode === 'local') return <Workspace store={localStore} />;
  return <CloudAccount>{(store, email, signOut) => <Workspace key={email} store={store} email={email} onSignOut={signOut} />}</CloudAccount>;
}

function Workspace({ store, email, onSignOut }: { store: ProjectStore; email?: string; onSignOut?: () => Promise<void> }) {
  const { listProjects, saveProject, deleteProject, putResumeFile, getResumeFile } = store;
  const isCloud = store.kind === 'cloud';
  const [localImportCount, setLocalImportCount] = useState(0);
  const [recoveryCount, setRecoveryCount] = useState(0);
  const [projects, setProjects] = useState<Project[]>(EMPTY_PROJECTS);
  const projectsRef = useRef<Project[]>(EMPTY_PROJECTS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [workspaceExpanded, setWorkspaceExpanded] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const [filter, setFilter] = useState<'all' | 'draft' | 'ready'>('all');
  const [search, setSearch] = useState('');
  const [resumeOpen, setResumeOpen] = useState(() => window.matchMedia('(min-width: 601px)').matches);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [projectForm, setProjectForm] = useState<'new' | 'edit' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [upload, setUpload] = useState<{ projectId: string; stage: string; progress: number } | null>(null);
  const [resumeEditing, setResumeEditing] = useState(false);
  const [resumeDraft, setResumeDraft] = useState('');
  const [manualResumeOpen, setManualResumeOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const saveRevision = useRef(0);
  const saveErrors = useRef(new Set<string>());
  const pendingSaves = useRef(new Map<string, Project>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = projects.find((p) => p.id === activeId) ?? null;
  const selected = active?.nodes.find((n) => n.id === selectedId) ?? null;
  const stats = getStats(active?.nodes ?? []);

  useEffect(() => {
    let alive = true;
    listProjects().then((items) => {
      if (!alive) return;
      let remembered: string | null = null;
      try { remembered = localStorage.getItem('folio-active-project'); } catch { /* IndexedDB still works if localStorage is unavailable. */ }
      projectsRef.current = items; setProjects(items); setActiveId(items.find((item) => item.id === remembered)?.id ?? items[0]?.id ?? null); setLoading(false);
    }).catch(() => { if (alive) { setLoadError(isCloud ? '클라우드 자료를 불러오지 못했습니다. 로그인 상태와 인터넷 연결, Supabase 초기 설정 SQL 적용 여부를 확인해 주세요.' : '브라우저 저장소를 열 수 없습니다. 시크릿 모드 또는 사이트 저장소 설정을 확인해 주세요.'); setLoading(false); } });
    return () => { alive = false; };
  }, []);
  useEffect(() => { if (isCloud) void localStore.listProjects().then((items) => setLocalImportCount(items.filter((p) => !p.isDemo).length)).catch(() => undefined); }, [isCloud]);
  useEffect(() => { if (store.ownerId) void recoveryDrafts(store.ownerId).then((items) => setRecoveryCount(items.length)).catch(() => undefined); }, [store.ownerId]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setSelection(null); setMenuOpen(false); setResumeEditing(false); setManualResumeOpen(false); if (activeId) { try { localStorage.setItem('folio-active-project', activeId); } catch { /* Navigation still works without localStorage. */ } } }, [activeId]);
  useEffect(() => { const listener = () => setSelection(null); window.addEventListener('resize', listener); return () => window.removeEventListener('resize', listener); }, []);
  useEffect(() => { const guard = (e: BeforeUnloadEvent) => { if (saveStatus === 'saving' || saveStatus === 'error') { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [saveStatus]);

  useEffect(() => {
    if (!workspaceExpanded) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setWorkspaceExpanded(false); setSelection(null); expandButton.current?.focus();
    };
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, [workspaceExpanded]);
  useEffect(() => { if (!active || loadError) setWorkspaceExpanded(false); }, [active?.id, loadError]);

  function flushPending() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const batch = [...pendingSaves.current.values()];
    pendingSaves.current.clear();
    if (!batch.length) return;
    const revision = saveRevision.current;
    saveQueue.current = saveQueue.current.then(async () => {
      for (const project of batch) {
        try { await saveProject(project); saveErrors.current.delete(project.id); }
        catch (error) { saveErrors.current.add(project.id); setSaveStatus('error'); setToast(error instanceof Error ? error.message : '저장하지 못했습니다. 다시 시도해 주세요.'); }
      }
      if (revision === saveRevision.current && !pendingSaves.current.size) setSaveStatus(saveErrors.current.size ? 'error' : 'saved');
    });
  }
  function persist(project: Project) {
    setSaveStatus('saving'); ++saveRevision.current;
    pendingSaves.current.set(project.id, project);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushPending, isCloud ? 550 : 80);
  }
  async function drainSaves() {
    flushPending(); await saveQueue.current;
    if (saveErrors.current.size) throw new Error('저장하지 못한 내용이 있습니다. 백업하거나 저장을 다시 시도해 주세요.');
  }
  async function reloadCloud(discard = false) {
    if (!discard) { try { await drainSaves(); } catch (error) { setToast((error as Error).message); return; } }
    else {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      pendingSaves.current.clear(); await saveQueue.current;
      for (const id of saveErrors.current) { const project = projectsRef.current.find((p) => p.id === id); if (project) { try { download(`${project.company}_미저장백업.json`, new Blob([serializeProject(project)], { type: 'application/json' })); } catch { setToast('백업하지 못했습니다. 직접 백업한 뒤 다시 시도해 주세요.'); return; } } }
    }
    setLoading(true);
    try {
      const items = await listProjects(); projectsRef.current = items; setProjects(items);
      setActiveId(items.find((p) => p.id === activeId)?.id ?? items[0]?.id ?? null);
      setSelectedId(null); setResumeEditing(false); saveErrors.current.clear(); setSaveStatus('saved'); setLoadError('');
    } catch (error) { setToast(error instanceof Error ? error.message : '최신 내용을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }
  function requestCloudReload() {
    if (saveErrors.current.size || resumeEditing) setConfirm({ title: '최신 내용을 불러올까요?', description: '작성 중인 이력서 텍스트 편집은 닫힙니다. 클라우드에 저장하지 못한 지원서는 백업 파일로 내려받은 뒤 최신 자료를 불러옵니다.', label: '최신 내용 불러오기', action: () => { setConfirm(null); void reloadCloud(true); } });
    else void reloadCloud();
  }
  async function importLocalProjects() {
    setConfirm(null);
    try { await drainSaves(); } catch (error) { setToast((error as Error).message); return; }
    setLoading(true);
    try {
      const existing = await listProjects();
      const ids = new Set(existing.map((p) => p.id));
      const local = (await localStore.listProjects()).filter((p) => !p.isDemo);
      for (const source of local) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source.id));
        const id = `local-${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
        if (ids.has(id)) continue;
        const file = await localStore.getResumeFile(source.id);
        if (file) await putResumeFile(id, file, source.resume ?? undefined);
        await saveProject({ ...source, id, isDemo: false, updatedAt: Date.now() });
      }
      const items = await listProjects(); projectsRef.current = items; setProjects(items); setActiveId(items[0]?.id ?? null); setSelectedId(null); setLocalImportCount(0); setToast('기존 자료를 현재 계정에 복사했습니다. 브라우저 원본은 유지됩니다.');
    } catch (error) { setToast(error instanceof Error ? error.message : '가져오지 못했습니다. 원본은 유지됩니다.'); }
    finally { setLoading(false); }
  }
  async function downloadRecovery() {
    if (!store.ownerId) return;
    try {
      const items = await recoveryDrafts(store.ownerId);
      for (const item of items) {
        download(`${item.project.company}_복구백업.json`, new Blob([serializeProject(item.project)], { type: 'application/json' }));
        await clearDraft(store.ownerId, item.project.id, item.token);
      }
      setRecoveryCount(0); setToast('미저장 자료를 백업했습니다. 백업 불러오기로 별도 지원서에 복구할 수 있어요. PDF 원본은 별도로 보관해 주세요.');
    } catch { setToast('복구 백업을 만들지 못했습니다. 다시 시도해 주세요.'); }
  }
  async function signOut() {
    setLoading(true);
    try { await drainSaves(); await onSignOut?.(); } catch (error) { setToast(error instanceof Error ? error.message : '로그아웃하지 못했습니다.'); setLoading(false); }
  }
  const updateProject = useCallback((id: string, patch: Partial<Project>) => {
    const original = projectsRef.current.find((p) => p.id === id);
    if (!original) return;
    const next = { ...original, ...patch, updatedAt: Date.now() };
    const items = projectsRef.current.map((p) => p.id === id ? next : p);
    projectsRef.current = items; setProjects(items); persist(next);
  }, []);
  function switchProject(id: string) { setActiveId(id); setSelectedId(null); setFilter('all'); setSearch(''); setSidebarOpen(false); }
  function addProject(project: Project) {
    const next = [...projectsRef.current, project]; projectsRef.current = next; setProjects(next); persist(project); switchProject(project.id); setProjectForm(null);
  }
  function addQuestion(parentId: string | null, anchor: string) {
    if (!active) return;
    if (!active.resume) { fileRef.current?.click(); return; }
    const node = createNode(parentId, anchor);
    updateProject(active.id, { nodes: [...active.nodes, node] }); setSelectedId(node.id); setSelection(null);
    window.getSelection()?.removeAllRanges();
  }
  function updateNode(patch: Partial<InterviewNode>) {
    if (!active || !selected) return;
    updateProject(active.id, { nodes: active.nodes.map((node) => {
      if (node.id !== selected.id) return node;
      const next = { ...node, ...patch };
      if (!next.answer.trim() || !next.question.trim()) next.status = 'draft';
      return next;
    }) });
  }
  function deleteBranch() {
    if (!active || !selected) return;
    const ids = getSubtreeIds(active.nodes, selected.id);
    setConfirm({ title: '이 질문을 삭제할까요?', description: `이 질문${ids.size > 1 ? `과 연결된 꼬리질문 ${ids.size - 1}개` : ''}가 함께 삭제됩니다. 삭제 후에는 되돌릴 수 없습니다.`, label: '질문 삭제', action: () => { updateProject(active.id, { nodes: active.nodes.filter((n) => !ids.has(n.id)) }); setSelectedId(null); setConfirm(null); setToast('질문을 삭제했습니다.'); } });
  }
  async function processPdf(file: File, projectId: string) {
    const controller = new AbortController(); uploadAbort.current = controller;
    setUpload({ projectId, stage: 'PDF를 확인하고 있어요', progress: 0 });
    try {
      const { extractResume } = await import('./lib/pdf');
      if (controller.signal.aborted) return;
      const result = await extractResume(file, (p) => setUpload({ projectId, ...p }), controller.signal);
      const resume = { name: file.name, ...result };
      await putResumeFile(projectId, file, resume);
      updateProject(projectId, { resume, nodes: [], isDemo: false });
      setSelectedId(null); setResumeOpen(true); setToast(`${result.pages}페이지의 이력서를 읽었습니다. 문구를 선택해 첫 질문을 만들어 보세요.`);
    } catch (error) { if (!controller.signal.aborted) setToast(error instanceof Error ? error.message : 'PDF를 읽지 못했습니다. 다른 파일을 확인해 주세요.'); }
    finally { setUpload(null); uploadAbort.current = null; }
  }
  function receivePdf(file: File | undefined) {
    if (!file || !active || upload) return;
    if (active.resume && active.nodes.length) {
      setConfirm({ title: '이력서를 교체할까요?', description: '기존 이력서에 연결된 질문과 답변이 모두 삭제됩니다. 필요한 내용은 먼저 백업해 주세요. 새 PDF를 읽는 데 실패하면 기존 내용은 유지됩니다.', label: '교체하기', action: () => { setConfirm(null); void processPdf(file, active.id); } });
    } else void processPdf(file, active.id);
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    try { if (file.size > 5 * 1024 * 1024) throw new Error('백업 파일은 5MB 이하여야 합니다.'); const project = parseProjectBackup(await file.text()); addProject(project); setToast('백업을 새로운 지원서로 불러왔습니다.'); }
    catch (error) { setToast(error instanceof Error ? error.message : '백업을 불러오지 못했습니다.'); }
  }
  function exportBackup() {
    if (!active) return;
    try {
      download(`${active.company}_${active.role}_면접백업.json`, new Blob([serializeProject(active)], { type: 'application/json' }));
      setToast('이력서 텍스트와 질문 트리를 백업했습니다. PDF 원본은 별도 보관해 주세요.');
    } catch (error) { setToast(error instanceof Error ? error.message : '백업을 만들지 못했습니다.'); }
  }
  async function openOriginal() {
    if (!active) return;
    try { const blob = await getResumeFile(active.id); if (blob) download(active.resume?.name ?? '이력서.pdf', blob); else setToast('샘플 또는 백업으로 불러온 이력서는 PDF 원본이 없습니다.'); }
    catch { setToast('PDF 원본을 불러오지 못했습니다.'); }
  }
  const filteredNodes = active?.nodes.filter((n) => (filter === 'all' || n.status === filter) && (!search || `${n.anchor} ${n.question} ${n.answer}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))) ?? [];

  const saveIndicator = <button className={`save-state ${saveStatus === 'error' ? 'save-error' : ''}`} disabled={saveStatus !== 'error'} onClick={() => { for (const id of saveErrors.current) { const project = projectsRef.current.find((item) => item.id === id); if (project) persist(project); } }} aria-label={saveStatus === 'error' ? '저장 실패, 다시 시도' : saveStatus === 'saving' ? '저장 중' : '모든 변경사항 저장됨'}>{saveStatus === 'saving' ? <LoaderCircle size={13} className="spin" /> : saveStatus === 'error' ? <CircleHelp size={13} /> : <CheckCheck size={14} />}{saveStatus === 'saving' ? '저장 중' : saveStatus === 'error' ? '저장 실패 · 다시 시도' : '모든 변경사항 저장됨'}</button>;

  return <div className="app-shell">
    {sidebarOpen && <button className="sidebar-shade" aria-label="메뉴 닫기" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'sidebar-mobile-open' : ''}`}>
      <a className="brand" href="#" onClick={(e) => { e.preventDefault(); if (projects[0]) switchProject(projects[0].id); }} aria-label="folio 홈"><span className="brand-mark">f<span /></span><span>folio<span className="brand-period">.</span></span></a>
      <p className="brand-tagline">나를 더 잘 말하는 준비</p>
      <div className="workspace-label"><span className="workspace-avatar">J</span><span>나의 워크스페이스<small>PERSONAL SPACE</small></span><LockKeyhole size={13} /></div>
      <div className="sidebar-section-label"><span>내 지원서</span><span className="count-pill">{projects.length.toString().padStart(2, '0')}</span></div>
      <nav className="project-nav" aria-label="지원서 목록">{projects.map((project) => <button key={project.id} className={`project-link ${activeId === project.id ? 'active' : ''}`} onClick={() => switchProject(project.id)}>
        <span className="company-avatar" style={{ background: project.companyColor }}>{project.company.slice(0, 1)}</span>
        <span className="project-link-text"><strong>{project.company}{project.isDemo && <i>샘플</i>}</strong><small>{project.role}</small></span><ChevronRight size={14} className="project-chevron" />
      </button>)}</nav>
      <button className="new-project-button" onClick={() => setProjectForm('new')} disabled={!!loadError || loading}><Plus size={16} />새 지원서 만들기</button>
      <button className="import-button" onClick={() => backupRef.current?.click()} disabled={!!loadError || loading}><ArrowDownToLine size={13} />백업 불러오기</button>
      <div className="sidebar-bottom"><div className="small-note"><span className="note-spark"><Sparkles size={17} /></span><strong>한 문장 더, 한 걸음 더.</strong><p>작은 질문들이 모여<br />나만의 이야기가 됩니다.</p><span className="note-line" /></div>
      <button className="sidebar-footer-link" onClick={() => setHelpOpen(true)}><CircleHelp size={17} />사용 가이드<ArrowUpRight size={13} /></button>
      <button className="sidebar-user" onClick={() => setPrivacyOpen(true)}><span className="profile-avatar">나</span><span><strong>나의 면접 준비 공간</strong><small><span className="online-dot" />{isCloud ? '내 계정에 클라우드 저장' : '이 브라우저에 저장 중'}</small></span><Settings2 size={15} /></button></div>
    </aside>

    <main className={`main-shell ${workspaceExpanded ? 'workspace-expanded' : ''}`}>
      <header className="topbar"><div className="breadcrumbs"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)} aria-label="지원서 메뉴 열기"><LayoutGrid size={19} /></button><span className="breadcrumb-home"><FolderOpen size={15} />내 지원서</span><ChevronRight size={13} /><span>{active?.company ?? '새로운 시작'}</span><span className="breadcrumb-divider">/</span><strong>{active?.role ?? '면접 준비'}</strong></div>
      <div className="topbar-right">{isCloud ? <div className="cloud-tools"><span className="cloud-user-email" title={email}>{email}</span><button className="cloud-action" aria-label="최신 내용 불러오기" disabled={!!upload || loading} onClick={requestCloudReload}><RefreshCw size={13} /><span>새로고침</span></button><button className="cloud-action" aria-label="로그아웃" disabled={!!upload || loading} onClick={() => void signOut()}><LogOut size={13} /><span>로그아웃</span></button></div> : <span className="cloud-local-note">이 기기에만 저장</span>}{!workspaceExpanded && saveIndicator}<span className="topbar-divider" /><button className="icon-button" aria-label="사용 가이드" onClick={() => setHelpOpen(true)}><CircleHelp size={19} /></button><span className="topbar-avatar">J</span></div></header>
      {isCloud && recoveryCount > 0 && <div className="cloud-import-banner"><span>이 계정의 미저장 복구 자료 {recoveryCount}개가 있어요.</span><button onClick={() => void downloadRecovery()}>복구 백업 내려받기</button></div>}
      {loading ? <div className="loading-screen"><LoaderCircle className="spin" size={28} /><p>준비 공간을 열고 있어요.</p></div> : loadError ? <div className="empty-workspace"><CircleHelp size={40} /><h1>저장소를 열지 못했어요</h1><p>{loadError}</p><button className="button button-primary" onClick={() => window.location.reload()}>다시 시도</button></div> : !active ? <div className="empty-workspace"><div className="empty-illustration"><GitBranch size={46} /></div><p className="eyebrow">YOUR NEXT CHAPTER</p><h1>좋은 면접은, 좋은 준비에서.</h1><p>이력서 한 문장에서 시작해<br />나만의 면접 지도를 만들어 보세요.</p><button className="button button-primary" onClick={() => setProjectForm('new')}><Plus size={17} />첫 지원서 만들기</button>{isCloud && localImportCount > 0 && <button className="text-button" disabled={!!upload || loading} onClick={() => setConfirm({ title: '기존 자료를 가져올까요?', description: `이 브라우저의 자료를 ${email} 계정으로 복사합니다. 원본은 유지됩니다.`, label: '가져오기', action: () => void importLocalProjects() })}>이 브라우저의 지원서 {localImportCount}개 가져오기</button>}</div> : <>
        {isCloud && localImportCount > 0 && <div className="cloud-import-banner"><span>이 브라우저에 기존 지원서 {localImportCount}개가 있어요.</span><button disabled={!!upload || loading || resumeEditing} onClick={() => setConfirm({ title: '기존 자료를 가져올까요?', description: `이 브라우저의 기존 자료를 현재 로그인한 ${email} 계정에 복사합니다. 같은 자료는 다시 가져오지 않으며, 브라우저 원본은 유지됩니다.`, label: '가져오기', action: () => void importLocalProjects() })}>내 계정으로 가져오기</button></div>}
        <section className="page-heading"><div><div className="page-eyebrow"><span />MY INTERVIEW MAP{active.isDemo && <span className="sample-badge">샘플 지원서</span>}</div><h1>흩어진 경험을, <span>단단한 답변으로.</span></h1><p>이력서 속 한 문장에서 시작해, 나만의 면접 흐름을 그려보세요.</p></div>
        <div className="heading-actions"><div className="menu-wrap"><button className="button button-outline" onClick={exportBackup}><ArrowDownToLine size={15} /><span>백업 내보내기</span></button><button className="icon-button more-button" aria-label="지원서 관리" onClick={() => setMenuOpen(!menuOpen)}><MoreHorizontal size={20} /></button>{menuOpen && <><button className="menu-dismiss" onClick={() => setMenuOpen(false)} aria-label="관리 메뉴 닫기" /><div className="dropdown-menu"><button onClick={() => { setProjectForm('edit'); setMenuOpen(false); }}><Settings2 size={15} />지원 정보 수정</button><button className="danger-text" disabled={!!upload} onClick={() => { setMenuOpen(false); setConfirm({ title: `${active.company} 지원서를 삭제할까요?`, description: '이력서 원본과 모든 질문·답변이 삭제됩니다. 필요한 내용은 먼저 백업해 주세요.', label: '지원서 삭제', action: () => { void drainSaves().then(() => deleteProject(active.id)).then(() => { const items = projectsRef.current.filter((p) => p.id !== active.id); projectsRef.current = items; setProjects(items); setActiveId(items[0]?.id ?? null); saveErrors.current.delete(active.id); setSelectedId(null); setConfirm(null); setToast('지원서를 삭제했습니다.'); }).catch(() => setToast('지원서를 삭제하지 못했습니다.')); } }); }}><Trash2 size={15} />지원서 삭제</button></div></>}</div></div></section>
        <section className="overview-strip" aria-label="준비 현황"><div className="overview-project"><span className="overview-logo" style={{ background: active.companyColor }}>{active.company.slice(0, 1)}</span><div><strong>{active.company}<ChevronDown size={13} /></strong><small>{active.role}</small></div></div><span className="overview-divider" /><div className="overview-stat"><span>전체 질문</span><strong>{stats.total}<small>개</small></strong></div><div className="overview-stat"><span><span className="status-dot green" />준비 완료</span><strong>{stats.ready}<small>개</small></strong></div><div className="overview-stat"><span><span className="status-dot amber" />작성 중</span><strong>{stats.draft}<small>개</small></strong></div><div className="overview-progress"><div><span>나의 준비도</span><strong>{stats.total ? Math.round(stats.ready / stats.total * 100) : 0}<small>%</small></strong></div><div className="progress-track"><span style={{ width: `${stats.total ? stats.ready / stats.total * 100 : 0}%` }} /></div></div></section>
        <section className="workspace-area" aria-label="면접 준비 작업 영역">
          <div className="workspace-toolbar"><div className="toolbar-left"><button className={`icon-button panel-toggle ${resumeOpen ? 'is-on' : ''}`} aria-label={resumeOpen ? '이력서 패널 접기' : '이력서 패널 열기'} onClick={() => setResumeOpen(!resumeOpen)}>{resumeOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button><span className="toolbar-line" /><div className="view-tabs" role="tablist" aria-label="질문 보기 방식"><button role="tab" aria-selected={view === 'map'} className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><GitBranch size={15} />마인드맵</button><button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => { setView('list'); if (window.innerWidth <= 600) setResumeOpen(false); }}><List size={16} />질문 목록</button></div><button ref={expandButton} className="button workspace-expand-button" aria-label={workspaceExpanded ? '작업 영역 전체화면 종료' : '작업 영역 전체화면'} aria-pressed={workspaceExpanded} title={workspaceExpanded ? '전체화면 종료 (Esc)' : '작업 영역 전체화면'} onClick={() => { setWorkspaceExpanded(!workspaceExpanded); setSelection(null); }}>{workspaceExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}<span>{workspaceExpanded ? '전체화면 종료' : '전체화면'}</span></button></div><div className="toolbar-right">{workspaceExpanded && saveIndicator}<label className="canvas-search"><Search size={15} /><input aria-label="질문 검색" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="질문 검색" />{search && <button className="icon-button" aria-label="검색 초기화" onClick={() => setSearch('')}><X size={12} /></button>}</label><span className="toolbar-line" /><select aria-label="준비 상태 필터" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">모든 상태</option><option value="ready">준비 완료</option><option value="draft">작성 중</option></select><button className="button button-primary add-question" onClick={() => addQuestion(null, '')}><Plus size={15} /><span>질문 추가</span></button></div></div>
          <div className={`workspace-content ${selected && !workspaceExpanded ? 'with-editor' : ''}`}>
            {resumeOpen && <aside className="resume-panel"><div className="resume-panel-heading"><div><FileText size={16} /><strong>나의 이력서</strong><span className="tiny-badge">{active.resume ? `${active.resume.pages}P` : 'PDF'}</span></div><button className="icon-button" aria-label="이력서 패널 닫기" onClick={() => setResumeOpen(false)}><X size={15} /></button></div>
            {upload?.projectId === active.id ? <div className="upload-progress"><div className="ocr-loader"><FileText size={32} /><span /></div><h3>경험을 읽고 있어요</h3><p>{upload.stage}</p><div className="progress-track"><span style={{ width: `${Math.round(upload.progress * 100)}%` }} /></div><span>{Math.round(upload.progress * 100)}%</span><button className="text-button" onClick={() => { uploadAbort.current?.abort(); setToast('이력서 읽기를 취소했습니다.'); }}>취소</button></div> : active.resume ? <><div className="resume-file"><span className="pdf-icon">PDF</span><span title={active.resume.name}>{active.resume.name}<small>{active.isDemo ? '가상의 예시 이력서' : active.resume.usedOcr ? 'OCR 인식 완료' : '텍스트 인식 완료'}</small></span><button className="icon-button" aria-label="이력서 교체" onClick={() => fileRef.current?.click()} disabled={!!upload}><Upload size={15} /></button></div><div className="resume-tip"><span className="tip-cursor">↖</span><p>궁금한 <strong>단어나 문장을 선택</strong>하면<br />새로운 질문을 연결할 수 있어요.</p></div><div className="resume-scroll" onScroll={() => setSelection(null)}>{resumeEditing ? <div className="resume-correction"><label htmlFor="resume-text-edit">인식한 텍스트 수정</label><textarea id="resume-text-edit" value={resumeDraft} onChange={(e) => setResumeDraft(e.target.value)} /><p>기존 질문의 연결 키워드는 유지됩니다.</p><div><button className="button button-outline" onClick={() => setResumeEditing(false)}>취소</button><button className="button button-primary" disabled={!resumeDraft.trim()} onClick={() => { updateProject(active.id, { resume: { ...active.resume!, text: resumeDraft } }); setResumeEditing(false); }}>수정 저장</button></div></div> : <SelectionText text={active.resume.text} nodes={active.nodes} onSelect={setSelection} />}</div><div className="resume-footer"><button className="text-button" onClick={() => { setResumeDraft(active.resume!.text); setResumeEditing(true); }}>텍스트 수정</button><button className="text-button" onClick={() => void openOriginal()}>원본 저장<ArrowDownToLine size={12} /></button></div></> : <div className="resume-upload" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); receivePdf(e.dataTransfer.files[0]); }}><div className="upload-icon"><Upload size={27} /></div><h3>이력서에서 시작하세요</h3><p>PDF를 끌어다 놓거나<br />아래 버튼으로 업로드해 주세요.</p><button className="button button-primary" onClick={() => fileRef.current?.click()} disabled={!!upload}><Plus size={15} />이력서 업로드</button><button className="text-button upload-manual" onClick={() => { setResumeDraft(''); setManualResumeOpen(true); }}>또는 텍스트로 직접 입력</button><small>PDF · 최대 20MB / 20페이지<br />한국어·영어 OCR 지원</small><div className="upload-privacy"><LockKeyhole size={13} />{isCloud ? 'PDF는 내 계정의 비공개 저장소에 보관돼요.' : '이력서는 이 브라우저 안에만 저장돼요.'}</div></div>}
            </aside>}
            <div className="map-panel">{view === 'map' ? <InterviewMap project={active} selectedId={selectedId} onSelect={setSelectedId} onAdd={addQuestion} onPositionChange={(id, position) => updateProject(active.id, { nodes: active.nodes.map((n) => n.id === id ? { ...n, position } : n) })} filter={filter} search={search} /> : <div className="question-list"><div className="list-heading"><div><p className="eyebrow">YOUR QUESTION LIBRARY</p><h2>차곡차곡 쌓인 질문들 <span>{filteredNodes.length}</span></h2></div><span>질문을 눌러 답변을 다듬어 보세요.</span></div>{filteredNodes.length ? filteredNodes.map((node, index) => <button key={node.id} className={`question-list-item ${selectedId === node.id ? 'selected' : ''}`} onClick={() => setSelectedId(node.id)}><span className="list-number">{(index + 1).toString().padStart(2, '0')}</span><div><div className="list-item-meta"><span>{node.parentId ? <GitBranch size={12} /> : <FileText size={12} />}{node.anchor || '연결 키워드 없음'}</span></div><strong>{node.question || '새로운 질문을 작성해 주세요'}</strong><p>{node.answer || '아직 답변을 작성하지 않았어요.'}</p></div><span className={`list-status ${node.status}`}><span />{node.status === 'ready' ? '준비 완료' : '작성 중'}</span><ChevronRight size={17} /></button>) : <div className="list-empty"><Search size={28} /><h3>{search || filter !== 'all' ? '일치하는 질문이 없어요' : '첫 질문을 연결해 보세요'}</h3><p>{search || filter !== 'all' ? '검색어나 상태 필터를 변경해 주세요.' : '이력서의 문구를 선택하면 나만의 질문이 시작돼요.'}</p></div>}</div>}</div>
            {selected && (workspaceExpanded ? <Modal title="질문 크게 편집" className="question-modal" showClose={false} initialFocus=".editor-question" onClose={() => setSelectedId(null)}><QuestionEditor key={selected.id} variant="dialog" node={selected} parent={active.nodes.find((n) => n.id === selected.parentId) ?? null} onChange={updateNode} onClose={() => setSelectedId(null)} onAddChild={(anchor) => addQuestion(selected.id, anchor)} onDelete={deleteBranch} /></Modal> : <QuestionEditor key={selected.id} node={selected} parent={active.nodes.find((n) => n.id === selected.parentId) ?? null} onChange={updateNode} onClose={() => setSelectedId(null)} onAddChild={(anchor) => addQuestion(selected.id, anchor)} onDelete={deleteBranch} />)}
          </div>
          <div className="workspace-status"><span><span className="status-dot green" />나의 경험이 질문으로, 질문이 자신감으로.</span><span><LockKeyhole size={11} />{isCloud ? '내 계정에 클라우드 저장' : '브라우저에 로컬 저장'}</span></div>
        </section>
      </>}
    </main>
    <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="이력서 PDF 파일" onChange={(e) => { receivePdf(e.target.files?.[0]); e.target.value = ''; }} />
    <input ref={backupRef} type="file" accept="application/json,.json" className="sr-only" aria-label="면접 백업 파일" onChange={(e) => { void importBackup(e.target.files?.[0]); e.target.value = ''; }} />
    {selection && active && <button className="selection-popover" style={{ left: selection.x, top: selection.y }} onMouseDown={(e) => e.preventDefault()} onClick={() => addQuestion(null, selection.text)}><Plus size={15} /><span>“{selection.text.length > 16 ? `${selection.text.slice(0, 16)}…` : selection.text}”에서 질문 추가</span></button>}
    {manualResumeOpen && active && <Modal onClose={() => setManualResumeOpen(false)} title="이력서 텍스트 입력" wide><p className="eyebrow">YOUR STORY STARTS HERE</p><h2>이력서 내용을 직접 입력하세요</h2><p className="modal-description">이력서 전체를 붙여 넣어도 좋아요. 입력한 문구에서 질문을 연결할 수 있습니다.</p><label className="form-label" htmlFor="manual-resume">이력서 내용</label><textarea id="manual-resume" className="manual-resume-text" value={resumeDraft} onChange={(e) => setResumeDraft(e.target.value)} maxLength={1000000} placeholder="경력, 프로젝트, 학력, 특기사항 등을 입력해 주세요." /><button className="button button-primary form-submit" disabled={!resumeDraft.trim()} onClick={() => { updateProject(active.id, { resume: { name: '직접 입력한 이력서', text: resumeDraft.trim(), pages: 1, usedOcr: false } }); setManualResumeOpen(false); setToast('이력서를 저장했습니다. 문구를 선택해 질문을 연결해 보세요.'); }}>이력서 저장<ArrowRight size={16} /></button></Modal>}
    {projectForm && <ProjectForm project={projectForm === 'edit' ? active ?? undefined : undefined} onClose={() => setProjectForm(null)} onSubmit={(company, role) => { if (projectForm === 'edit' && active) { updateProject(active.id, { company, role }); setProjectForm(null); } else addProject(createProject(company, role)); }} />}
    {confirm && <Modal onClose={() => setConfirm(null)} title={confirm.title}><div className="modal-symbol danger-symbol"><Trash2 size={24} /></div><h2>{confirm.title}</h2><p className="modal-description">{confirm.description}</p><div className="confirm-actions"><button className="button button-outline" onClick={() => setConfirm(null)}>취소</button><button className="button button-danger" onClick={confirm.action}>{confirm.label ?? '삭제'}</button></div></Modal>}
    {helpOpen && <Modal onClose={() => setHelpOpen(false)} title="folio 사용 가이드" wide><p className="eyebrow">A LITTLE GUIDE</p><h2>한 문장에서, 나만의 면접 지도로.</h2><p className="modal-description">면접관의 시선으로 질문하고, 나의 언어로 답해 보세요.</p><div className="guide-steps">{[{ icon: <Upload size={21} />, title: '01. 지원서를 만들고 이력서를 올려요', body: '지원 기업과 직무를 등록하고 PDF를 업로드하세요. 스캔된 PDF도 한국어·영어 OCR로 읽을 수 있어요.' }, { icon: <BookOpen size={21} />, title: '02. 이력서의 문구에서 질문을 시작해요', body: '단어나 문장을 드래그해 선택한 뒤 ‘질문 추가’를 누르세요. 예상 질문과 답변은 직접 작성해요.' }, { icon: <GitBranch size={21} />, title: '03. 답변에서 다음 질문으로 이어가요', body: '질문 편집 화면에서 답변 일부를 선택하면 꼬리질문을 만들 수 있어요. 여러 갈래로, 원하는 만큼 확장하세요.' }, { icon: <CheckCircle2 size={21} />, title: '04. 다듬고, 완료하고, 백업해요', body: '질문과 답변을 다듬고 준비 상태를 표시하세요. 브라우저 데이터 삭제에 대비해 백업 파일도 보관해 주세요.' }].map((step) => <div className="guide-step" key={step.title}><span>{step.icon}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></div>)}</div><button className="button button-primary form-submit" onClick={() => setHelpOpen(false)}>준비 시작하기<ArrowRight size={16} /></button></Modal>}
    {privacyOpen && <Modal onClose={() => setPrivacyOpen(false)} title="저장 공간 안내"><div className="modal-symbol"><LockKeyhole size={24} /></div><h2>{isCloud ? '내 계정으로, 어디서든.' : '내 이야기는, 내 브라우저에.'}</h2><p className="modal-description">{isCloud ? '이력서 PDF와 질문 트리는 로그인한 계정의 Supabase 저장소에 보관됩니다. 같은 계정으로 로그인하면 다른 기기에서 이어서 준비할 수 있습니다. PDF 처리와 OCR은 브라우저에서 실행됩니다.' : '이력서 PDF, 인식한 텍스트, 질문과 답변은 현재 기기의 브라우저 저장소에 보관됩니다. PDF 처리와 OCR도 브라우저에서 실행됩니다.'}</p><div className="privacy-note"><strong>백업을 함께 보관해 주세요.</strong><p>{isCloud ? '다른 기기에서 작성한 최신 내용은 ‘최신 내용 불러오기’ 버튼으로 확인하세요. 같은 지원서를 동시에 수정하면 덮어쓰기를 막고 안내합니다.' : '다른 기기와 자동 동기화되지 않으며, 브라우저 데이터를 삭제하면 준비 내용도 삭제됩니다.'} ‘백업 내보내기’로 질문 트리와 이력서 텍스트를 보관할 수 있어요. PDF 원본은 별도로 보관해 주세요.</p></div><button className="button button-primary form-submit" onClick={() => setPrivacyOpen(false)}>확인했어요<Check size={16} /></button></Modal>}
    {toast && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{toast}</span><button onClick={() => setToast('')} aria-label="알림 닫기"><X size={15} /></button></div>}
  </div>;
}
