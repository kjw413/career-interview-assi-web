import { describe, expect, it } from 'vitest';
import type { InterviewNode, InterviewStage } from '../types';
import { createNode } from './tree';
import { copyQuestionsToStage, getQuestionStage, getStageNodes, INTERVIEW_STAGES, MAX_INTERVIEW_QUESTIONS, replaceStageNodes } from './interviewStages';

function node(id: string, parentId: string | null = null, stage?: InterviewStage): InterviewNode {
  return { ...createNode(parentId, id, 'basic'), id, ...(stage ? { stage } : {}) };
}

describe('interview stages', () => {
  it('keeps all legacy questions in the first stage without rewriting them', () => {
    const nodes = [node('legacy'), node('explicit-first', null, 'first'), node('executive', null, 'second')];
    expect(INTERVIEW_STAGES.map(stage => stage.label)).toEqual(['1차(직무)', '2차(임원)']);
    expect(getQuestionStage(nodes[0])).toBe('first');
    expect(getStageNodes(nodes, 'first')).toEqual(nodes.slice(0, 2));
    expect(getStageNodes(nodes, 'second')).toEqual([nodes[2]]);
    expect(nodes[0]).not.toHaveProperty('stage');
  });

  it('copies exactly selected questions with new IDs and keeps only selected direct-parent links', () => {
    const nodes = [node('root'), node('child', 'root'), node('deep', 'child'), node('unselected'), node('existing', null, 'second')];
    const before = structuredClone(nodes);
    const copied = copyQuestionsToStage(nodes, 'first', 'second', new Set(['root', 'child', 'existing', 'missing']));
    expect(copied).toHaveLength(7);
    expect(copied.slice(0, nodes.length).every((entry, index) => entry === nodes[index])).toBe(true);
    const [root, child] = copied.slice(nodes.length);
    expect(root.id).not.toBe('root');
    expect(child.id).not.toBe('child');
    expect(root.parentId).toBeNull();
    expect(child.parentId).toBe(root.id);
    expect(root.stage).toBe('second');
    expect(child.stage).toBe('second');
    expect(nodes).toEqual(before);
    const separated = copyQuestionsToStage(nodes, 'first', 'second', new Set(['root', 'deep'])).slice(nodes.length);
    expect(separated.map(entry => entry.parentId)).toEqual([null, null]);
    expect(separated.map(entry => entry.anchor)).toEqual(['root', 'deep']);
  });

  it('preserves inherited categories and preparation content while making copies independently editable', () => {
    const root = node('root');
    const child = node('child', 'root');
    delete child.category;
    child.answer = '핵심 답변';
    child.answerFormatting = [{ start: 0, end: 2, bold: true }];
    child.question = '어떤 경험인가요?';
    child.questionFormatting = [{ start: 0, end: 2, color: '#b42318' }];
    child.status = 'ready';
    child.position = { x: 800, y: 600 };
    const copied = copyQuestionsToStage([root, child], 'first', 'second', new Set(['child']));
    const copy = copied[2];
    expect(copy).toMatchObject({ parentId: null, category: 'basic', stage: 'second', question: child.question, answer: child.answer, status: 'ready' });
    expect(copy).not.toHaveProperty('position');
    expect(copy.answerFormatting).toEqual(child.answerFormatting);
    expect(copy.questionFormatting).toEqual(child.questionFormatting);
    copy.answerFormatting![0].bold = undefined;
    copy.questionFormatting![0].color = '#000000';
    expect(child.answerFormatting[0].bold).toBe(true);
    expect(child.questionFormatting[0].color).toBe('#b42318');
    expect(child).not.toHaveProperty('category');
  });

  it('can copy back to the first stage and leaves empty, invalid and same-stage requests unchanged', () => {
    const nodes = [node('first'), node('second', null, 'second')];
    const copied = copyQuestionsToStage(nodes, 'second', 'first', new Set(['second']));
    expect(copied[2].stage).toBe('first');
    expect(copyQuestionsToStage(nodes, 'first', 'second', new Set())).toBe(nodes);
    expect(copyQuestionsToStage(nodes, 'first', 'second', new Set(['missing', 'second']))).toBe(nodes);
    expect(copyQuestionsToStage(nodes, 'first', 'first', new Set(['first']))).toBe(nodes);
    expect(copyQuestionsToStage(nodes, 'invalid' as InterviewStage, 'first', new Set(['first']))).toBe(nodes);
  });

  it('edits, reorders, deletes and adds within one stage while preserving the other stage', () => {
    const nodes = [node('first-a'), node('second-a', null, 'second'), node('first-b'), node('second-b', null, 'second')];
    const edited = { ...nodes[2], answer: '수정한 답변' };
    const result = replaceStageNodes(nodes, 'first', [edited, nodes[0], node('new-first')]);
    expect(getStageNodes(result, 'first').map(entry => entry.id)).toEqual(['first-b', 'first-a', 'new-first']);
    expect(getStageNodes(result, 'second')).toEqual([nodes[1], nodes[3]]);
    expect(getStageNodes(result, 'second')[0]).toBe(nodes[1]);
    expect(nodes[2].answer).toBe('');
    const deleted = replaceStageNodes(result, 'first', []);
    expect(deleted).toEqual([nodes[1], nodes[3]]);
    const added = replaceStageNodes(deleted, 'first', [nodes[0]]);
    expect(added).toEqual([nodes[1], nodes[3], nodes[0]]);
    expect(added[2]).not.toHaveProperty('stage');
    expect(replaceStageNodes(nodes, 'first', getStageNodes(nodes, 'first'))).toBe(nodes);
    const second = replaceStageNodes(nodes, 'second', [node('new-second')]);
    expect(getStageNodes(second, 'second')[0].stage).toBe('second');
    expect(getStageNodes(second, 'first')).toEqual([nodes[0], nodes[2]]);
  });

  it('enforces the aggregate question limit before adding copies', () => {
    const nodes = Array.from({ length: MAX_INTERVIEW_QUESTIONS }, (_, index) => node(`question-${index}`));
    expect(() => copyQuestionsToStage(nodes, 'first', 'second', new Set([nodes[0].id]))).toThrow('2,000');
    expect(nodes).toHaveLength(MAX_INTERVIEW_QUESTIONS);
  });
});
