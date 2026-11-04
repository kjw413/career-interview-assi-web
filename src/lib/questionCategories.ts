import type { InterviewNode, QuestionCategory } from '../types';
import { getQuestionOutline, type QuestionOutlineEntry } from './tree';

export const QUESTION_CATEGORIES = [
  { id: 'basic', label: '필수질문', description: '자기소개, 지원동기, 이직동기, 강약점 등 나에 대한 핵심 내용을 준비하세요.' },
  { id: 'situational', label: '상황·가치관', description: '갈등 대응, 우선순위와 선택 상황에서의 판단 기준과 행동 이유를 정리하세요.' },
  { id: 'fundamentals', label: '전공기초', description: '전공과 직무에서 필요한 기초 개념, 원리와 핵심 지식을 정리하세요.' },
  { id: 'resume', label: '자소서기반', description: '이력서·자기소개서의 경험과 문장에서 예상 질문을 연결하세요.' },
] as const satisfies readonly { id: QuestionCategory; label: string; description: string }[];

export function isQuestionCategory(value: unknown): value is QuestionCategory {
  return value === 'basic' || value === 'situational' || value === 'fundamentals' || value === 'resume';
}

function getOutlineCategories(outline: QuestionOutlineEntry[]): Map<string, QuestionCategory> {
  const categories = new Map<string, QuestionCategory>();
  for (const { node, parentId } of outline) {
    categories.set(node.id, isQuestionCategory(node.category)
      ? node.category
      : (parentId === null ? undefined : categories.get(parentId)) ?? 'resume');
  }
  return categories;
}

/** Each question owns its category; only legacy questions inherit their parent's category. */
export function getQuestionCategories(nodes: InterviewNode[]): Map<string, QuestionCategory> {
  return getOutlineCategories(getQuestionOutline(nodes));
}

/** Materialize a legacy category only when a preceding change would reclassify the question. */
function preserveLegacyCategories(nodes: InterviewNode[], previous: Map<string, QuestionCategory>): InterviewNode[] {
  const effective = new Map<string, QuestionCategory>();
  const replacements = new Map<InterviewNode, InterviewNode>();
  for (const { node, parentId } of getQuestionOutline(nodes)) {
    const inherited = (parentId === null ? undefined : effective.get(parentId)) ?? 'resume';
    const category = isQuestionCategory(node.category) ? node.category : previous.get(node.id) ?? inherited;
    effective.set(node.id, category);
    if (!isQuestionCategory(node.category) && category !== inherited) replacements.set(node, { ...node, category });
  }
  return replacements.size ? nodes.map(node => replacements.get(node) ?? node) : nodes;
}

/** Change one question while preserving every other question's effective category and links. */
export function setQuestionCategory(nodes: InterviewNode[], id: string, category: QuestionCategory): InterviewNode[] {
  if (!isQuestionCategory(category)) return nodes;
  const selected = nodes.find(node => node.id === id);
  if (!selected) return nodes;
  if (selected.category === category) return nodes;
  const previous = getQuestionCategories(nodes);
  const changed = nodes.map(node => node === selected ? { ...node, category } : node);
  return preserveLegacyCategories(changed, previous);
}

/** Remove one category without deleting differently categorized follow-up questions. */
export function removeQuestionCategory(nodes: InterviewNode[], category: QuestionCategory): InterviewNode[] {
  if (!isQuestionCategory(category)) return nodes;
  const outline = getQuestionOutline(nodes);
  const previous = getOutlineCategories(outline);
  const removed = new Set(outline.filter(entry => previous.get(entry.node.id) === category).map(entry => entry.node.id));
  if (!removed.size) return nodes;
  const entries = new Map(outline.map(entry => [entry.node.id, entry]));
  const retained = nodes.filter(node => !removed.has(node.id)).map(node => {
    if (node.parentId === null || !removed.has(node.parentId)) return node;
    const ancestors = entries.get(node.id)?.ancestorIds ?? [];
    let parentId: string | null = null;
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      if (!removed.has(ancestors[index])) {
        parentId = ancestors[index];
        break;
      }
    }
    return { ...node, parentId };
  });
  return preserveLegacyCategories(retained, previous);
}
