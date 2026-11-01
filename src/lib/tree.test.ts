import { describe, expect, it } from 'vitest';
import type { InterviewNode } from '../types';
import { createNode, createProject, getQuestionOutline, getStats, getSubtreeIds, layoutQuestionRows, layoutTree, reorderQuestionBranch } from './tree';

function node(id: string, parentId: string | null = null): InterviewNode {
  return { ...createNode(parentId, `출발 구절 ${id}`), id };
}

describe('interview tree', () => {
  it('keeps applications independent even for the same company and role', () => {
    const first = createProject('  토스  ', ' 프론트엔드 개발자 ');
    const second = createProject('토스', '프론트엔드 개발자');
    expect(first.id).not.toBe(second.id);
    expect(first.company).toBe('토스');
    expect(first.role).toBe('프론트엔드 개발자');
    expect(first.resume).toBeNull();
    expect(first.nodes).toEqual([]);
  });

  it('deletes a complete descendant branch without removing its siblings or ancestors', () => {
    const nodes = [node('a'), node('b', 'a'), node('c', 'b'), node('d', 'a'), node('e')];
    const removed = getSubtreeIds(nodes, 'b');
    expect([...removed].sort()).toEqual(['b', 'c']);
    expect(nodes.filter((entry) => !removed.has(entry.id)).map((entry) => entry.id)).toEqual(['a', 'd', 'e']);
  });

  it('groups late-created follow-ups with their root and preserves real branching ancestry', () => {
    const nodes = [node('first'), node('second'), node('left', 'first'), node('right', 'first'), node('deep', 'left')];
    expect(getQuestionOutline(nodes).map(({ node, label, depth, parentId, ancestorIds }) => ({ id: node.id, label, depth, parentId, ancestorIds }))).toEqual([
      { id: 'first', label: '1-1', depth: 0, parentId: null, ancestorIds: [] },
      { id: 'left', label: '1-2', depth: 1, parentId: 'first', ancestorIds: ['first'] },
      { id: 'deep', label: '1-3', depth: 2, parentId: 'left', ancestorIds: ['first', 'left'] },
      { id: 'right', label: '1-4', depth: 1, parentId: 'first', ancestorIds: ['first'] },
      { id: 'second', label: '2-1', depth: 0, parentId: null, ancestorIds: [] },
    ]);
  });

  it('numbers out-of-order descendants before filtering without renumbering matches', () => {
    const nodes = [node('deep', 'child'), node('root'), node('child', 'root'), node('other')];
    const outline = getQuestionOutline(nodes);
    expect(outline.map(({ node, label }) => [node.id, label])).toEqual([
      ['root', '1-1'], ['child', '1-2'], ['deep', '1-3'], ['other', '2-1'],
    ]);
    expect(outline.filter(({ node }) => node.id === 'deep' || node.id === 'other').map(({ label }) => label)).toEqual(['1-3', '2-1']);
  });

  it('keeps orphaned and cyclic outline entries visible once with finite ancestry', () => {
    const nodes = [node('cycle-a', 'cycle-b'), node('orphan', 'missing'), node('cycle-b', 'cycle-a'), node('self', 'self')];
    const outline = getQuestionOutline(nodes);
    expect(outline.map(({ node, label, parentId, ancestorIds }) => [node.id, label, parentId, ancestorIds])).toEqual([
      ['orphan', '1-1', null, []],
      ['cycle-a', '2-1', null, []],
      ['cycle-b', '2-2', 'cycle-a', ['cycle-a']],
      ['self', '3-1', null, []],
    ]);
    expect(getQuestionOutline([])).toEqual([]);
  });

  it('moves entire question flows using a descendant as the drop target without changing their contents', () => {
    const nodes = [node('first'), node('second'), node('third'), node('left', 'first'), node('right', 'first'), node('deep', 'left'), node('second-child', 'second')];
    nodes[0].question = '첫 질문';
    nodes[3].answer = '작성한 답변';
    nodes[3].status = 'ready';
    nodes[3].position = { x: 40, y: 80 };
    const snapshot = structuredClone(nodes);

    const reordered = reorderQuestionBranch(nodes, 'second', 'deep', 'before');
    expect(reordered.map((entry) => entry.id)).toEqual(['second', 'second-child', 'first', 'left', 'deep', 'right', 'third']);
    expect(getQuestionOutline(reordered).map(({ node, label }) => [node.id, label])).toEqual([
      ['second', '1-1'], ['second-child', '1-2'], ['first', '2-1'], ['left', '2-2'], ['deep', '2-3'], ['right', '2-4'], ['third', '3-1'],
    ]);
    expect(nodes).toEqual(snapshot);
    for (const original of nodes) expect(reordered.find((entry) => entry.id === original.id)).toBe(original);
  });

  it('moves a parent together with all of its descendants after another complete flow', () => {
    const nodes = [node('a'), node('b', 'a'), node('c', 'b'), node('d', 'a'), node('e'), node('f', 'e'), node('g')];
    expect(reorderQuestionBranch(nodes, 'a', 'f', 'after').map((entry) => entry.id)).toEqual(['e', 'f', 'a', 'b', 'c', 'd', 'g']);
    expect(reorderQuestionBranch(nodes, 'g', 'f', 'before').map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd', 'g', 'e', 'f']);
  });

  it('never reorders connected questions independently and preserves the original reference for no-op drops', () => {
    const nodes = [node('a'), node('e'), node('b', 'a'), node('c', 'a'), node('d', 'b')];
    expect(reorderQuestionBranch(nodes, 'b', 'c', 'after')).toBe(nodes);
    expect(reorderQuestionBranch(nodes, 'b', 'e', 'before')).toBe(nodes);
    expect(reorderQuestionBranch(nodes, 'a', 'd', 'after')).toBe(nodes);
    expect(reorderQuestionBranch(nodes, 'a', 'a', 'before')).toBe(nodes);
    expect(reorderQuestionBranch(nodes, 'a', 'e', 'before')).toBe(nodes);
    expect(reorderQuestionBranch(nodes, 'missing', 'e', 'before')).toBe(nodes);
    expect(reorderQuestionBranch(nodes, 'a', 'missing', 'after')).toBe(nodes);
    expect(reorderQuestionBranch([], 'a', 'b', 'before')).toEqual([]);
  });

  it('terminates on malformed cycles and keeps cyclic components visible for recovery', () => {
    const nodes = [node('a', 'c'), node('b', 'a'), node('c', 'b')];
    expect(getSubtreeIds(nodes, 'a').size).toBe(3);
    expect(Object.keys(layoutTree(nodes)).sort()).toEqual(['a', 'b', 'c', 'resume-root']);
    expect(getStats(nodes).maxDepth).toBe(3);
  });

  it('lays out branching answers from left to right with separate leaf rows', () => {
    const positions = layoutTree([node('a'), node('b', 'a'), node('c', 'a'), node('d')]);
    expect(positions.b.x).toBeGreaterThan(positions.a.x);
    expect(positions.a.x).toBeGreaterThan(positions['resume-root'].x);
    expect(positions.b.y).not.toBe(positions.c.y);
    expect(positions.d.y).toBeGreaterThan(positions.c.y);
    expect(positions.a.y).toBe((positions.b.y + positions.c.y) / 2);
  });

  it('handles missing parents and empty trees without dropping content', () => {
    expect(layoutTree([])).toEqual({ 'resume-root': { x: 0, y: 0 } });
    expect(layoutTree([node('orphan', 'missing')]).orphan.x).toBe(390);
    expect(getStats([])).toEqual({ total: 0, ready: 0, draft: 0, roots: 0, maxDepth: 0 });
  });

  it('arranges root flows vertically and all numbered follow-ups horizontally without changing branches or contents', () => {
    const nodes = [node('deep', 'left'), node('first'), node('second'), node('left', 'first'), node('right', 'first')];
    nodes[3].answer = '작성한 답변';
    nodes[3].position = { x: 900, y: -40 };
    const snapshot = structuredClone(nodes);
    const positions = layoutQuestionRows(nodes);
    const firstRow = ['first', 'left', 'deep', 'right'];
    expect(firstRow.map(id => positions[id].y)).toEqual([0, 0, 0, 0]);
    expect(firstRow.map(id => positions[id].x)).toEqual([390, 800, 1210, 1620]);
    expect(positions.second.x).toBe(positions.first.x);
    expect(positions.second.y).toBeGreaterThan(positions.first.y + 400);
    expect(nodes).toEqual(snapshot);
  });

  it('keeps double-digit group numbers in their numeric question order', () => {
    const nodes = Array.from({ length: 12 }, (_, index) => node(`root-${index + 1}`));
    const positions = layoutQuestionRows(nodes);
    expect(nodes.map(entry => positions[entry.id].x)).toEqual(Array(12).fill(390));
    for (let index = 1; index < nodes.length; index += 1) {
      expect(positions[nodes[index].id].y).toBeGreaterThan(positions[nodes[index - 1].id].y);
    }
    expect(positions['root-10'].y).toBeGreaterThan(positions['root-9'].y);
  });

  it('uses measured card sizes and reserves connection lanes without overlapping rows', () => {
    const nodes = [node('a'), node('b', 'a'), node('c'), node('d', 'c')];
    const positions = layoutQuestionRows(nodes, {
      'resume-root': { width: 300, height: 360 },
      a: { width: 420, height: 520 }, b: { width: 500, height: 710 },
      c: { width: 340, height: 450 }, d: { width: 320, height: 400 },
    });
    expect(positions.a.x).toBe(430);
    expect(positions.b.x).toBe(positions.a.x + 420 + 90);
    expect(positions.b.y).toBe(positions.a.y);
    expect(positions.c.x).toBe(positions.a.x);
    expect(positions.c.y).toBe(positions.a.y + 710 + 120 + 80);
    expect(positions.d.x).toBe(positions.c.x + 340 + 90);
    const centers = [positions.a.y + 520 / 2, positions.c.y + 450 / 2];
    expect(positions['resume-root']).toEqual({ x: 0, y: (centers[0] + centers[1]) / 2 - 360 / 2 });
  });

  it('keeps orphaned and cyclic rows finite and uses safe fallbacks for missing measurements', () => {
    const nodes = [node('cycle-a', 'cycle-b'), node('orphan', 'missing'), node('cycle-b', 'cycle-a'), node('self', 'self')];
    const positions = layoutQuestionRows(nodes, {
      orphan: { width: Number.NaN, height: -1 }, self: { width: 0, height: Number.POSITIVE_INFINITY },
    });
    expect(Object.keys(positions).sort()).toEqual(['cycle-a', 'cycle-b', 'orphan', 'resume-root', 'self']);
    expect(positions.orphan).toEqual({ x: 390, y: 0 });
    expect(positions['cycle-a'].y).toBe(positions['cycle-b'].y);
    expect(positions['cycle-b'].x).toBeGreaterThan(positions['cycle-a'].x);
    for (const position of Object.values(positions)) expect(Number.isFinite(position.x) && Number.isFinite(position.y)).toBe(true);
    expect(layoutQuestionRows([])).toEqual({ 'resume-root': { x: 0, y: 0 } });
  });
});
