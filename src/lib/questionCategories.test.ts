import { describe, expect, it } from 'vitest';
import type { InterviewNode, QuestionCategory } from '../types';
import { createNode } from './tree';
import { getQuestionCategories, QUESTION_CATEGORIES, removeQuestionCategory, setQuestionCategory } from './questionCategories';

function node(id: string, parentId: string | null = null, category: QuestionCategory = 'resume'): InterviewNode {
  return { ...createNode(parentId, id, category), id };
}

function legacy(id: string, parentId: string | null = null): InterviewNode {
  const entry = node(id, parentId);
  delete entry.category;
  return entry;
}

describe('question categories', () => {
  it('defaults new questions to resume and accepts explicit categories without requiring a resume document', () => {
    expect(createNode(null, '').category).toBe('resume');
    expect(createNode(null, '', 'basic').category).toBe('basic');
    expect(createNode(null, '', 'situational').category).toBe('situational');
    expect(createNode('parent', '설명한 개념', 'fundamentals').category).toBe('fundamentals');
  });

  it('honors each explicit category and only inherits missing legacy categories from the nearest parent', () => {
    expect(QUESTION_CATEGORIES.map(category => category.label)).toEqual(['필수질문', '상황·가치관', '전공기초', '자소서기반']);
    const nodes = [legacy('deep', 'child'), node('child', 'root', 'fundamentals'), node('root', null, 'basic'), legacy('sibling', 'root'), legacy('old-root')];
    expect([...getQuestionCategories(nodes)]).toEqual([
      ['root', 'basic'], ['child', 'fundamentals'], ['deep', 'fundamentals'], ['sibling', 'basic'], ['old-root', 'resume'],
    ]);
  });

  it('allows independent edits to a parent, child and grandchild without changing their links', () => {
    const nodes = [node('root', null, 'basic'), node('child', 'root', 'basic'), node('deep', 'child', 'basic')];
    const childChanged = setQuestionCategory(nodes, 'child', 'situational');
    expect([...getQuestionCategories(childChanged).values()]).toEqual(['basic', 'situational', 'basic']);
    expect(childChanged[0]).toBe(nodes[0]);
    expect(childChanged[2]).toBe(nodes[2]);
    const parentChanged = setQuestionCategory(childChanged, 'root', 'fundamentals');
    expect([...getQuestionCategories(parentChanged).values()]).toEqual(['fundamentals', 'situational', 'basic']);
    const grandchildChanged = setQuestionCategory(parentChanged, 'deep', 'resume');
    expect([...getQuestionCategories(grandchildChanged).values()]).toEqual(['fundamentals', 'situational', 'resume']);
    expect(grandchildChanged.map(entry => entry.parentId)).toEqual([null, 'root', 'child']);
    expect(nodes.map(entry => entry.category)).toEqual(['basic', 'basic', 'basic']);
  });

  it('freezes an inherited legacy branch when its parent changes and preserves preparation content', () => {
    const nodes = [node('root', null, 'basic'), legacy('child', 'root'), legacy('deep', 'child'), node('explicit', 'root', 'fundamentals'), legacy('explicit-child', 'explicit'), node('other')];
    nodes[1].question = '갈등 상황에 어떻게 대응하나요?';
    nodes[1].answer = '판단 기준과 행동을 설명합니다.';
    nodes[1].answerFormatting = [{ start: 0, end: 5, bold: true }];
    nodes[1].position = { x: 450, y: 100 };
    nodes[1].status = 'ready';
    const before = structuredClone(nodes);
    const changed = setQuestionCategory(nodes, 'root', 'situational');
    expect([...getQuestionCategories(changed).values()]).toEqual(['situational', 'basic', 'basic', 'fundamentals', 'fundamentals', 'resume']);
    expect(changed[1].category).toBe('basic');
    expect(changed[2].category).toBeUndefined();
    expect(changed.slice(2).every((entry, index) => entry === nodes[index + 2])).toBe(true);
    expect(changed.map(entry => entry.id)).toEqual(nodes.map(entry => entry.id));
    expect(changed.map(({ category: _category, ...entry }) => entry)).toEqual(nodes.map(({ category: _category, ...entry }) => entry));
    expect(nodes).toEqual(before);
    const childChanged = setQuestionCategory(changed, 'child', 'fundamentals');
    expect([...getQuestionCategories(childChanged).values()]).toEqual(['situational', 'fundamentals', 'basic', 'fundamentals', 'fundamentals', 'resume']);
    expect(childChanged[2].category).toBe('basic');
  });

  it('can make an inherited category explicit without reclassifying any other question', () => {
    const nodes = [node('root', null, 'basic'), legacy('child', 'root'), legacy('deep', 'child')];
    const changed = setQuestionCategory(nodes, 'child', 'basic');
    expect(changed[1].category).toBe('basic');
    expect(changed[0]).toBe(nodes[0]);
    expect(changed[2]).toBe(nodes[2]);
    expect(setQuestionCategory(changed, 'child', 'basic')).toBe(changed);
    expect(setQuestionCategory(nodes, 'missing', 'basic')).toBe(nodes);
    expect(setQuestionCategory(nodes, 'child', 'unknown' as QuestionCategory)).toBe(nodes);
  });

  it('recovers invalid legacy fields, orphaned nodes and cycles without changing unrelated questions', () => {
    const invalid = Object.assign(legacy('invalid', 'a'), { category: 'unknown' });
    const nodes = [node('a', 'b', 'basic'), legacy('b', 'a'), legacy('orphan', 'missing'), invalid];
    expect([...getQuestionCategories(nodes)]).toEqual([['orphan', 'resume'], ['a', 'basic'], ['b', 'basic'], ['invalid', 'basic']]);
    const moved = setQuestionCategory(nodes, 'a', 'fundamentals');
    expect([...getQuestionCategories(moved)]).toEqual([['orphan', 'resume'], ['a', 'fundamentals'], ['b', 'basic'], ['invalid', 'basic']]);
    expect(moved[1].category).toBe('basic');
    expect(moved[3].category).toBe('basic');
    expect(moved[2]).toBe(nodes[2]);
    const orphanChanged = setQuestionCategory(nodes, 'orphan', 'situational');
    expect(orphanChanged[2].parentId).toBe('missing');
    expect(orphanChanged[0]).toBe(nodes[0]);
    expect(getQuestionCategories([]).size).toBe(0);
    const empty: InterviewNode[] = [];
    expect(setQuestionCategory(empty, 'missing', 'basic')).toBe(empty);
  });

  it('removes only the requested effective category and promotes retained follow-ups to their nearest surviving ancestor', () => {
    const nodes = [
      node('root', null, 'basic'), node('remove-parent', 'root'), legacy('remove-legacy', 'remove-parent'),
      node('retain-child', 'remove-legacy', 'situational'), legacy('retain-legacy', 'retain-child'),
      node('remove-deep', 'retain-child'), node('retain-deep', 'remove-deep', 'fundamentals'),
      node('remove-root'), node('promoted-root', 'remove-root', 'basic'), node('unrelated', null, 'fundamentals'),
    ];
    nodes[3].answer = '준비한 답변';
    nodes[3].answerFormatting = [{ start: 0, end: 3, backgroundColor: '#fff1a8' }];
    nodes[3].position = { x: 700, y: 200 };
    const before = structuredClone(nodes);
    const retained = removeQuestionCategory(nodes, 'resume');
    expect(retained.map(entry => [entry.id, entry.parentId])).toEqual([
      ['root', null], ['retain-child', 'root'], ['retain-legacy', 'retain-child'],
      ['retain-deep', 'retain-child'], ['promoted-root', null], ['unrelated', null],
    ]);
    expect([...getQuestionCategories(retained).values()]).toEqual(['basic', 'situational', 'situational', 'fundamentals', 'basic', 'fundamentals']);
    expect(retained[0]).toBe(nodes[0]);
    expect(retained[2]).toBe(nodes[4]);
    expect(retained[5]).toBe(nodes[9]);
    expect({ ...retained[1], parentId: nodes[3].parentId }).toEqual(nodes[3]);
    expect(nodes).toEqual(before);
  });

  it('keeps legacy inheritance and damaged components finite when category removal cuts a cycle', () => {
    const nodes = [legacy('a', 'b'), node('b', 'a', 'basic'), legacy('c', 'b'), node('other', 'c', 'situational'), legacy('orphan', 'missing')];
    expect([...getQuestionCategories(nodes)]).toEqual([['orphan', 'resume'], ['a', 'resume'], ['b', 'basic'], ['c', 'basic'], ['other', 'situational']]);
    const retained = removeQuestionCategory(nodes, 'basic');
    expect(retained.map(entry => [entry.id, entry.parentId])).toEqual([['a', null], ['other', 'a'], ['orphan', 'missing']]);
    expect([...getQuestionCategories(retained)]).toEqual([['a', 'resume'], ['other', 'situational'], ['orphan', 'resume']]);
    expect(retained[2]).toBe(nodes[4]);
    expect(removeQuestionCategory(retained, 'basic')).toBe(retained);
    expect(removeQuestionCategory(nodes, 'unknown' as QuestionCategory)).toBe(nodes);
    const empty: InterviewNode[] = [];
    expect(removeQuestionCategory(empty, 'basic')).toBe(empty);
    const allRemoved = [node('root'), legacy('child', 'root')];
    expect(removeQuestionCategory(allRemoved, 'resume')).toEqual([]);
  });
});
