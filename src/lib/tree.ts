import type { InterviewNode, Project } from '../types';

const COMPANY_COLORS = ['#177a68', '#4784db', '#e58a54', '#9b7ad3', '#cd6c8d'];

export function createProject(company: string, role: string): Project {
  const now = Date.now();
  const hash = [...company].reduce((value, char) => value + char.charCodeAt(0), 0);
  return {
    id: crypto.randomUUID(),
    company: company.trim(),
    role: role.trim(),
    companyColor: COMPANY_COLORS[hash % COMPANY_COLORS.length],
    createdAt: now,
    updatedAt: now,
    resume: null,
    nodes: [],
  };
}

export function createNode(parentId: string | null, anchor: string): InterviewNode {
  return {
    id: crypto.randomUUID(),
    parentId,
    anchor: anchor.trim(),
    question: '',
    answer: '',
    interviewer: '실무진',
    status: 'draft',
  };
}

/** Includes the starting node. Iterative traversal also tolerates malformed cycles. */
export function getSubtreeIds(nodes: InterviewNode[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId !== null) {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node.id);
      children.set(node.parentId, siblings);
    }
  }
  const visited = new Set<string>();
  const pending = [id];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(children.get(current) ?? []));
  }
  return visited;
}

export function getStats(nodes: InterviewNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let maxDepth = 0;
  for (const node of nodes) {
    const visited = new Set<string>();
    let current: InterviewNode | undefined = node;
    let depth = 0;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      depth += 1;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    maxDepth = Math.max(maxDepth, depth);
  }
  const ready = nodes.filter((node) => node.status === 'ready').length;
  return {
    total: nodes.length,
    ready,
    draft: nodes.length - ready,
    roots: nodes.filter((node) => node.parentId === null || !byId.has(node.parentId)).length,
    maxDepth,
  };
}

/** Balanced horizontal tree; returned coordinates include the implicit resume root. */
export function layoutTree(nodes: InterviewNode[]): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map<string, InterviewNode[]>();
  for (const node of nodes) {
    const parent = node.parentId && byId.has(node.parentId) ? node.parentId : 'resume-root';
    const siblings = children.get(parent) ?? [];
    siblings.push(node);
    children.set(parent, siblings);
  }
  const visited = new Set<string>();
  let nextLeafY = 0;

  const visit = (id: string, depth: number): number => {
    visited.add(id);
    const childRows = (children.get(id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map((child) => visit(child.id, depth + 1));
    let y: number;
    if (childRows.length === 0) {
      y = nextLeafY;
      nextLeafY += 250;
    } else {
      y = (childRows[0] + childRows[childRows.length - 1]) / 2;
    }
    positions[id] = { x: depth * 390, y };
    return y;
  };

  visit('resume-root', 0);
  // Corrupt/orphaned cyclic components must remain visible and recoverable.
  for (const node of nodes) if (!visited.has(node.id)) visit(node.id, 1);
  return positions;
}
