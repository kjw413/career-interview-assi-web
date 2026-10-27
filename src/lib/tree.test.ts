import { describe, expect, it } from 'vitest';
import type { InterviewNode } from '../types';
import { createNode, createProject, getStats, getSubtreeIds, layoutTree } from './tree';

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
});
