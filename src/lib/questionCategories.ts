import type { InterviewNode, QuestionCategory } from '../types';
import { getQuestionOutline } from './tree';

export const QUESTION_CATEGORIES = [
  { id: 'basic', label: '기본질문', description: '직무·산업 지원동기, 이직동기 등 자주 나오는 공통 질문을 준비하세요.' },
  { id: 'fundamentals', label: '전공기초', description: '전공과 직무에서 필요한 기초 개념, 원리와 핵심 지식을 정리하세요.' },
  { id: 'resume', label: '자소서기반', description: '이력서·자기소개서의 경험과 문장에서 예상 질문을 연결하세요.' },
] as const satisfies readonly { id: QuestionCategory; label: string; description: string }[];

export function isQuestionCategory(value: unknown): value is QuestionCategory {
  return value === 'basic' || value === 'fundamentals' || value === 'resume';
}

/** Keep complete interview flows in one category, including legacy and damaged trees. */
export function getQuestionCategories(nodes: InterviewNode[]): Map<string, QuestionCategory> {
  const categories = new Map<string, QuestionCategory>();
  let current: QuestionCategory = 'resume';
  for (const entry of getQuestionOutline(nodes)) {
    if (entry.parentId === null) current = isQuestionCategory(entry.node.category) ? entry.node.category : 'resume';
    categories.set(entry.node.id, current);
  }
  return categories;
}

/** Changing any question moves its entire root flow without changing links or contents. */
export function setQuestionBranchCategory(nodes: InterviewNode[], id: string, category: QuestionCategory): InterviewNode[] {
  if (!isQuestionCategory(category)) return nodes;
  const outline = getQuestionOutline(nodes);
  const selected = outline.find(entry => entry.node.id === id);
  if (!selected) return nodes;
  const rootId = selected.ancestorIds[0] ?? selected.node.id;
  const flowIds = new Set(outline.filter(entry => (entry.ancestorIds[0] ?? entry.node.id) === rootId).map(entry => entry.node.id));
  if (nodes.every(node => !flowIds.has(node.id) || node.category === category)) return nodes;
  return nodes.map(node => flowIds.has(node.id) && node.category !== category ? { ...node, category } : node);
}
