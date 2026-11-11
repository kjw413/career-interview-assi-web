import type { InterviewNode, InterviewStage } from '../types';
import { getQuestionCategories } from './questionCategories';

export const INTERVIEW_STAGES = [
  { id: 'first', label: '1차(직무)' },
  { id: 'second', label: '2차(임원)' },
] as const satisfies readonly { id: InterviewStage; label: string }[];

export const MAX_INTERVIEW_QUESTIONS = 2_000;

export function isInterviewStage(value: unknown): value is InterviewStage {
  return value === 'first' || value === 'second';
}

/** Legacy questions stay in the first interview without rewriting their saved data. */
export function getQuestionStage(node: InterviewNode): InterviewStage {
  return node.stage === 'second' ? 'second' : 'first';
}

export function getStageNodes(nodes: InterviewNode[], stage: InterviewStage): InterviewNode[] {
  return nodes.filter(node => getQuestionStage(node) === stage);
}

/** Apply a complete stage edit while retaining every question in the other stage. */
export function replaceStageNodes(allNodes: InterviewNode[], stage: InterviewStage, replacement: InterviewNode[]): InterviewNode[] {
  if (!isInterviewStage(stage)) return allNodes;
  const normalized = replacement.map(node => getQuestionStage(node) === stage ? node : { ...node, stage });
  const result: InterviewNode[] = [];
  let cursor = 0;
  let lastStageIndex = -1;
  for (const node of allNodes) {
    if (getQuestionStage(node) !== stage) {
      result.push(node);
      continue;
    }
    if (cursor < normalized.length) result.push(normalized[cursor++]);
    lastStageIndex = result.length;
  }
  result.splice(lastStageIndex < 0 ? result.length : lastStageIndex, 0, ...normalized.slice(cursor));
  return result.length === allNodes.length && result.every((node, index) => node === allNodes[index]) ? allNodes : result;
}

/** Copy exactly the selected questions. Unselected parents and descendants are never added. */
export function copyQuestionsToStage(allNodes: InterviewNode[], sourceStage: InterviewStage, targetStage: InterviewStage, selectedIds: ReadonlySet<string>): InterviewNode[] {
  if (!isInterviewStage(sourceStage) || !isInterviewStage(targetStage) || sourceStage === targetStage || !selectedIds.size) return allNodes;
  const source = getStageNodes(allNodes, sourceStage);
  const selected = source.filter(node => selectedIds.has(node.id));
  if (!selected.length) return allNodes;
  if (allNodes.length + selected.length > MAX_INTERVIEW_QUESTIONS) {
    throw new Error(`질문은 두 차수를 합쳐 최대 ${MAX_INTERVIEW_QUESTIONS.toLocaleString('ko-KR')}개까지 저장할 수 있습니다.`);
  }
  const categories = getQuestionCategories(source);
  const ids = new Map(selected.map(node => [node.id, crypto.randomUUID()]));
  const copies = selected.map(node => {
    const copy = structuredClone(node);
    copy.id = ids.get(node.id)!;
    copy.parentId = node.parentId === null ? null : ids.get(node.parentId) ?? null;
    copy.stage = targetStage;
    copy.category = categories.get(node.id) ?? 'resume';
    delete copy.position;
    return copy;
  });
  return [...allNodes, ...copies];
}
