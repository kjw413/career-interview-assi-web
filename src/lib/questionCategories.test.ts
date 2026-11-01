import { describe, expect, it } from 'vitest';
import type { InterviewNode } from '../types';
import { createNode } from './tree';
import { getQuestionCategories, setQuestionBranchCategory } from './questionCategories';

function node(id: string, parentId: string | null = null): InterviewNode {
  return { ...createNode(parentId, id), id };
}

describe('question categories', () => {
  it('defaults new questions to resume and accepts explicit categories without requiring a resume document', () => {
    expect(createNode(null, '').category).toBe('resume');
    expect(createNode(null, '', 'basic').category).toBe('basic');
    expect(createNode('parent', '설명한 개념', 'fundamentals').category).toBe('fundamentals');
  });

  it('inherits the root category regardless of creation order or inconsistent child fields', () => {
    const root = { ...node('root'), category: 'basic' as const };
    const child = { ...node('child', 'root'), category: 'fundamentals' as const };
    const legacy = node('legacy'); delete legacy.category;
    expect([...getQuestionCategories([node('deep', 'child'), child, root, legacy])]).toEqual([
      ['root', 'basic'], ['child', 'basic'], ['deep', 'basic'], ['legacy', 'resume'],
    ]);
  });

  it('moves an entire root flow from a child while retaining order, links and preparation content', () => {
    const nodes = [node('root'), node('other'), node('left', 'root'), node('deep', 'left'), node('right', 'root')];
    nodes[2].answer = '핵심 답변';
    nodes[2].answerFormatting = [{ start: 0, end: 2, bold: true }];
    nodes[2].position = { x: 50, y: 100 };
    nodes[2].status = 'ready';
    const original = structuredClone(nodes);
    const changed = setQuestionBranchCategory(nodes, 'deep', 'fundamentals');
    expect(changed.map(entry => entry.id)).toEqual(nodes.map(entry => entry.id));
    expect(changed.map(entry => entry.category)).toEqual(['fundamentals', 'resume', 'fundamentals', 'fundamentals', 'fundamentals']);
    expect(changed.map(({ category: _category, ...entry }) => entry)).toEqual(nodes.map(({ category: _category, ...entry }) => entry));
    expect(changed[1]).toBe(nodes[1]);
    expect(nodes).toEqual(original);
    expect(setQuestionBranchCategory(changed, 'left', 'fundamentals')).toBe(changed);
    expect(setQuestionBranchCategory(nodes, 'missing', 'basic')).toBe(nodes);
  });

  it('keeps orphaned and cyclic components finite and moves only the selected recovered flow', () => {
    const nodes = [{ ...node('a', 'b'), category: 'basic' as const }, node('b', 'a'), node('orphan', 'missing')];
    expect([...getQuestionCategories(nodes)]).toEqual([['orphan', 'resume'], ['a', 'basic'], ['b', 'basic']]);
    const moved = setQuestionBranchCategory(nodes, 'b', 'fundamentals');
    expect(moved.map(entry => entry.category)).toEqual(['fundamentals', 'fundamentals', 'resume']);
    expect(getQuestionCategories([]).size).toBe(0);
    expect(setQuestionBranchCategory([], 'missing', 'basic')).toEqual([]);
  });
});
