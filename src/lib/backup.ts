import type { InterviewNode, Project, ResumeData } from '../types';
import { validateTextFormatting } from './textFormatting';
import { validateAnswerStylePresets } from './answerStylePresets';

export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_NODES = 2_000;

function invalid(detail: string): never {
  throw new Error(`백업 파일을 불러올 수 없습니다. ${detail}`);
}

function record(value: unknown, label: string, allowedKeys: string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${label} 형식을 확인해 주세요.`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !allowedKeys.includes(key))) invalid(`${label}에 지원하지 않는 항목이 있습니다.`);
  return result;
}

function string(value: unknown, label: string, maximum: number, nonempty = true): string {
  if (typeof value !== 'string' || value.length > maximum || (nonempty && !value.trim())) {
    invalid(`${label}이(가) 없거나 허용 길이를 초과했습니다.`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string, minimum = -1_000_000, maximum = 1_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    invalid(`${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

function validateResume(value: unknown): ResumeData | null {
  if (value === null) return null;
  const source = record(value, '이력서', ['name', 'text', 'pages', 'usedOcr']);
  const pages = finiteNumber(source.pages, '이력서 페이지 수', 1, 20);
  if (!Number.isInteger(pages)) invalid('이력서 페이지 수가 올바르지 않습니다.');
  if (typeof source.usedOcr !== 'boolean') invalid('이력서 인식 정보가 올바르지 않습니다.');
  return {
    name: string(source.name, '이력서 파일명', 255),
    text: string(source.text, '이력서 텍스트', 1_000_000, false),
    pages,
    usedOcr: source.usedOcr,
  };
}

function validateNode(value: unknown): InterviewNode {
  // Accept the retired field in existing v1 backups, but omit it from new exports.
  const source = record(value, '질문', ['id', 'parentId', 'anchor', 'question', 'answer', 'questionFormatting', 'answerFormatting', 'interviewer', 'status', 'position']);
  const status = source.status;
  if (status !== 'draft' && status !== 'ready') invalid('질문의 작성 상태가 올바르지 않습니다.');
  const node: InterviewNode = {
    id: string(source.id, '질문 ID', 160),
    parentId: source.parentId === null ? null : string(source.parentId, '상위 질문 ID', 160),
    anchor: string(source.anchor, '연결된 구절', 4_000, false),
    question: string(source.question, '질문 내용', 20_000, false),
    answer: string(source.answer, '답변 내용', 100_000, false),
    status,
  };
  if (source.position !== undefined) {
    const position = record(source.position, '질문 위치', ['x', 'y']);
    node.position = { x: finiteNumber(position.x, '질문 가로 위치'), y: finiteNumber(position.y, '질문 세로 위치') };
  }
  for (const field of ['question', 'answer'] as const) {
    const key = `${field}Formatting` as const;
    if (source[key] !== undefined) {
      try { node[key] = validateTextFormatting(source[key], node[field]); }
      catch (error) { invalid(error instanceof Error ? error.message : '글자 서식 정보를 확인해 주세요.'); }
    }
  }
  return node;
}

function validateProject(value: unknown): Project {
  const source = record(value, '지원서', ['id', 'company', 'role', 'companyColor', 'createdAt', 'updatedAt', 'resume', 'nodes', 'answerStylePresets', 'isDemo']);
  if (typeof source.companyColor !== 'string' || !/^#[\da-f]{6}$/i.test(source.companyColor)) invalid('기업 표시 색상이 올바르지 않습니다.');
  if (!Array.isArray(source.nodes) || source.nodes.length > MAX_NODES) invalid(`질문은 최대 ${MAX_NODES.toLocaleString('ko-KR')}개까지 불러올 수 있습니다.`);
  if (source.isDemo !== undefined && typeof source.isDemo !== 'boolean') invalid('샘플 지원서 정보가 올바르지 않습니다.');
  const nodes = source.nodes.map(validateNode);
  const byId = new Map<string, InterviewNode>();
  for (const node of nodes) {
    if (byId.has(node.id)) invalid('중복된 질문 ID가 있습니다.');
    byId.set(node.id, node);
  }
  for (const node of nodes) {
    if (node.parentId !== null && !byId.has(node.parentId)) invalid('연결 대상이 없는 꼬리질문이 있습니다.');
  }
  const completed = new Set<string>();
  for (const node of nodes) {
    const path = new Set<string>();
    let current: string | null = node.id;
    while (current !== null && !completed.has(current)) {
      if (path.has(current)) invalid('질문 연결이 순환하고 있습니다. 원본 파일을 확인해 주세요.');
      path.add(current);
      current = byId.get(current)!.parentId;
    }
    for (const id of path) completed.add(id);
  }
  let answerStylePresets: Project['answerStylePresets'];
  if (source.answerStylePresets !== undefined) {
    try { answerStylePresets = validateAnswerStylePresets(source.answerStylePresets); }
    catch (error) { invalid(error instanceof Error ? error.message : '저장한 답변 서식을 확인해 주세요.'); }
  }
  return {
    id: string(source.id, '지원서 ID', 160),
    company: string(source.company, '기업명', 160),
    role: string(source.role, '지원 직무', 300),
    companyColor: source.companyColor,
    createdAt: finiteNumber(source.createdAt, '생성 시각', 0, 8_640_000_000_000_000),
    updatedAt: finiteNumber(source.updatedAt, '수정 시각', 0, 8_640_000_000_000_000),
    resume: validateResume(source.resume),
    nodes,
    ...(answerStylePresets !== undefined ? { answerStylePresets } : {}),
    ...(source.isDemo !== undefined ? { isDemo: source.isDemo } : {}),
  };
}

function checkSize(text: string): void {
  if (text.length > MAX_BACKUP_BYTES || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    invalid('백업 파일은 5MB 이하여야 합니다.');
  }
}

/** PDF binaries are intentionally excluded; resume text and every question branch are included. */
export function serializeProject(project: Project): string {
  const validated = validateProject(project);
  const result = JSON.stringify({ schemaVersion: 1, project: validated }, null, 2);
  checkSize(result);
  return result;
}

/** Treat a backup as untrusted input and import as a separate, never-overwriting application. */
export function parseProjectBackup(text: string): Project {
  checkSize(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    invalid('올바른 JSON 백업 파일을 선택해 주세요.');
  }
  const envelope = record(parsed, '백업 파일', ['schemaVersion', 'project']);
  if (envelope.schemaVersion !== 1) invalid('지원하지 않는 백업 버전입니다. 버전 1 백업을 선택해 주세요.');
  const project = validateProject(envelope.project);
  const ids = new Map(project.nodes.map((node) => [node.id, crypto.randomUUID()]));
  const now = Date.now();
  return {
    ...project,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    isDemo: false,
    nodes: project.nodes.map((node) => ({
      ...node,
      id: ids.get(node.id)!,
      parentId: node.parentId === null ? null : ids.get(node.parentId)!,
    })),
  };
}
