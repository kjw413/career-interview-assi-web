import { describe, expect, it } from 'vitest';
import { createDemoProject } from './demo';
import { MAX_BACKUP_BYTES, parseProjectBackup, serializeProject } from './backup';
import { createNode, createProject } from './tree';

function backup(edit?: (project: ReturnType<typeof createDemoProject>) => void): string {
  const project = createDemoProject();
  edit?.(project);
  return JSON.stringify({ schemaVersion: 1, project });
}

describe('project backups', () => {
  it('round-trips all preparation content and remaps IDs without altering the source', () => {
    const original = createDemoProject();
    const text = serializeProject(original);
    const restored = parseProjectBackup(text);
    expect(restored.id).not.toBe(original.id);
    expect(restored.isDemo).toBe(false);
    expect(restored.company).toBe(original.company);
    expect(restored.resume).toEqual(original.resume);
    expect(restored.nodes).toHaveLength(original.nodes.length);
    const sourceIds = new Set(original.nodes.map((node) => node.id));
    const restoredIds = new Set(restored.nodes.map((node) => node.id));
    for (let index = 0; index < restored.nodes.length; index += 1) {
      const node = restored.nodes[index];
      expect(sourceIds.has(node.id)).toBe(false);
      expect(node.question).toBe(original.nodes[index].question);
      expect(node.answer).toBe(original.nodes[index].answer);
      expect(node.anchor).toBe(original.nodes[index].anchor);
      if (node.parentId) {
        expect(restoredIds.has(node.parentId)).toBe(true);
        const originalParent = original.nodes.findIndex((entry) => entry.id === original.nodes[index].parentId);
        expect(restored.nodes[originalParent].id).toBe(node.parentId);
      }
    }
    expect(original.isDemo).toBe(true);
  });

  it('accepts legacy interviewer fields while preserving questions, answers and branch links', () => {
    const original = createDemoProject();
    const legacy = { ...original, nodes: original.nodes.map((node, index) => ({ ...node, interviewer: ['실무진', '부서장', '인사팀'][index % 3] })) };
    const restored = parseProjectBackup(JSON.stringify({ schemaVersion: 1, project: legacy }));
    expect(restored.nodes.map(({ question, answer, anchor, status }) => ({ question, answer, anchor, status })))
      .toEqual(original.nodes.map(({ question, answer, anchor, status }) => ({ question, answer, anchor, status })));
    original.nodes.forEach((node, index) => {
      const parentIndex = original.nodes.findIndex((candidate) => candidate.id === node.parentId);
      expect(restored.nodes[index].parentId).toBe(parentIndex < 0 ? null : restored.nodes[parentIndex].id);
    });
    expect(restored.nodes.every((node) => !('interviewer' in node))).toBe(true);
    expect(JSON.parse(serializeProject(legacy)).project.nodes.every((node: Record<string, unknown>) => !('interviewer' in node))).toBe(true);
    expect(createNode(null, '키워드')).not.toHaveProperty('interviewer');
  });

  it('imports the same backup twice as separate applications', () => {
    const text = backup();
    const first = parseProjectBackup(text);
    const second = parseProjectBackup(text);
    expect(first.id).not.toBe(second.id);
    expect(first.nodes[0].id).not.toBe(second.nodes[0].id);
  });

  it('supports empty applications and draft question text', () => {
    const project = createProject('새 기업', '지원 직무');
    project.nodes.push(createNode(null, ''));
    const restored = parseProjectBackup(serializeProject(project));
    expect(restored.resume).toBeNull();
    expect(restored.nodes[0].question).toBe('');
    expect(restored.nodes[0].answer).toBe('');
  });

  it('keeps inline question and answer formatting through backup import and remapped branches', () => {
    const original = createDemoProject();
    original.nodes[0].questionFormatting = [{ start: 0, end: 3, bold: true }];
    original.nodes[0].answerFormatting = [{ start: 0, end: 3, color: '#b83232', backgroundColor: '#fff1a8' }];
    const restored = parseProjectBackup(serializeProject(original));
    expect(restored.nodes[0].questionFormatting).toEqual(original.nodes[0].questionFormatting);
    expect(restored.nodes[0].answerFormatting).toEqual(original.nodes[0].answerFormatting);
    expect(restored.nodes[0].question).toBe(original.nodes[0].question);
    expect(restored.nodes[0].answer).toBe(original.nodes[0].answer);
    expect(restored.nodes[0].id).not.toBe(original.nodes[0].id);
    expect(restored.nodes[1].parentId).toBe(restored.nodes[0].id);
    expect(restored.nodes[1]).not.toHaveProperty('answerFormatting');
  });

  it('rejects unsafe colors, mismatched ranges and unknown formatting properties in backups', () => {
    const invalidFormatting = [
      [{ start: 0, end: 1, color: 'url(evil)' }],
      [{ start: 0, end: 1, backgroundColor: 'red;position:fixed' }],
      [{ start: 0, end: 100_000, bold: true }],
      [{ start: 0, end: 1, html: '<script>evil</script>' }],
    ];
    for (const answerFormatting of invalidFormatting) {
      expect(() => parseProjectBackup(backup(project => { Object.assign(project.nodes[0], { answerFormatting }); }))).toThrow('글자 서식');
    }
  });

  it('rejects bad JSON, unsupported versions, and unexpected root fields', () => {
    expect(() => parseProjectBackup('not json')).toThrow('JSON');
    expect(() => parseProjectBackup(JSON.stringify({ schemaVersion: 2, project: {} }))).toThrow('버전');
    expect(() => parseProjectBackup(JSON.stringify({ schemaVersion: 1, project: createDemoProject(), file: 'binary' }))).toThrow('지원하지 않는 항목');
  });

  it('enforces the size limit in UTF-8 bytes', () => {
    expect(() => parseProjectBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toThrow('5MB');
    expect(() => parseProjectBackup('한'.repeat(Math.ceil(MAX_BACKUP_BYTES / 3)))).toThrow('5MB');
  });

  it('rejects missing and duplicate question references', () => {
    expect(() => parseProjectBackup(backup((project) => { project.nodes[1].id = project.nodes[0].id; }))).toThrow('중복');
    expect(() => parseProjectBackup(backup((project) => { project.nodes[1].parentId = 'missing'; }))).toThrow('연결 대상');
  });

  it('rejects cycles, including self-referencing questions', () => {
    expect(() => parseProjectBackup(backup((project) => { project.nodes[0].parentId = project.nodes[1].id; }))).toThrow('순환');
    expect(() => parseProjectBackup(backup((project) => { project.nodes[0].parentId = project.nodes[0].id; }))).toThrow('순환');
  });

  it('rejects malformed statuses, coordinates, and source fields', () => {
    const malformed = [
      (project: ReturnType<typeof createDemoProject>) => { (project.nodes[0] as unknown as Record<string, unknown>).status = true; },
      (project: ReturnType<typeof createDemoProject>) => { project.nodes[0].position = { x: Infinity, y: 0 }; },
      (project: ReturnType<typeof createDemoProject>) => { project.resume!.pages = 0; },
      (project: ReturnType<typeof createDemoProject>) => { (project.resume as unknown as Record<string, unknown>).usedOcr = 'yes'; },
      (project: ReturnType<typeof createDemoProject>) => { project.companyColor = 'url(evil)'; },
    ];
    for (const edit of malformed) expect(() => parseProjectBackup(backup(edit))).toThrow('백업 파일');
  });

  it('rejects excessive node counts and content fields', () => {
    expect(() => parseProjectBackup(backup((project) => {
      project.nodes = Array.from({ length: 2_001 }, (_, index) => ({ ...createNode(null, '키워드'), id: `node-${index}` }));
    }))).toThrow('2,000');
    expect(() => parseProjectBackup(backup((project) => { project.nodes[0].answer = 'x'.repeat(100_001); }))).toThrow('답변');
  });
});
