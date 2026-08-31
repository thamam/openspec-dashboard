import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getChangeDag } from '../src/services/dagService.js';

// S15/L1: getChangeDag is LIVE via cli.ts/mcp.ts and always returned edges:[].
// The linkages.json in the change directory (same file /api/artifacts serves)
// is the traceability source; edges must be built from it by matching endpoint
// labels to node labels — exact match first, then the repo's documented fuzzy
// convention (case-insensitive substring, both sides >= 5 chars, AGENTS.md /
// client linkages.ts).

function makeChange(): { repo: string; changeDir: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'dag-test-'));
  const changeDir = path.join(repo, 'openspec', 'changes', 'my-change');
  fs.mkdirSync(path.join(changeDir, 'specs', 'auth'), { recursive: true });
  return { repo, changeDir };
}

describe('dagService — getChangeDag', () => {
  let repo: string;
  let changeDir: string;

  beforeEach(() => {
    ({ repo, changeDir } = makeChange());
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('throws when the change directory does not exist', async () => {
    await expect(getChangeDag(repo, 'no-such-change')).rejects.toThrow(/not found/);
  });

  it('emits a proposal node when proposal.md exists', async () => {
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# Proposal\n');
    const dag = await getChangeDag(repo, 'my-change');
    expect(dag.nodes).toContainEqual(
      expect.objectContaining({ id: 'proposal-doc', type: 'proposal' })
    );
  });

  it('parses requirement nodes from nested spec files', async () => {
    fs.writeFileSync(
      path.join(changeDir, 'specs', 'auth', 'spec.md'),
      '## ADDED Requirements\n\n### Requirement: User Login\nUsers SHALL log in.\n'
    );
    const dag = await getChangeDag(repo, 'my-change');
    expect(dag.nodes).toContainEqual(
      expect.objectContaining({ id: 'req-user-login', label: 'User Login', type: 'spec-requirement' })
    );
  });

  it('parses decision nodes from design.md', async () => {
    fs.writeFileSync(
      path.join(changeDir, 'design.md'),
      '### Decision 1: Use JWT Tokens\nRationale.\n'
    );
    const dag = await getChangeDag(repo, 'my-change');
    expect(dag.nodes).toContainEqual(
      expect.objectContaining({ id: 'dec-use-jwt-tokens', label: 'Use JWT Tokens', type: 'design-decision' })
    );
  });

  it('parses task nodes with status from tasks.md', async () => {
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      '- [x] 1.1 Implement login endpoint\n- [ ] 1.2 Add login form\n'
    );
    const dag = await getChangeDag(repo, 'my-change');
    const tasks = dag.nodes.filter((n) => n.type === 'task');
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ label: '1.1 Implement login endpoint', status: 'completed' });
    expect(tasks[1]).toMatchObject({ label: '1.2 Add login form', status: 'pending' });
  });

  it('rates complexity Low/Medium/High from task count', async () => {
    const mk = async (n: number) => {
      fs.writeFileSync(
        path.join(changeDir, 'tasks.md'),
        Array.from({ length: n }, (_, i) => `- [ ] Task number ${i + 1}`).join('\n')
      );
      return (await getChangeDag(repo, 'my-change')).complexity;
    };
    expect((await mk(4))!.rating).toBe('Low');
    expect((await mk(5))!.rating).toBe('Medium');
    expect((await mk(9))!.rating).toBe('High');
  });

  // --- L1: edges built from linkages.json (RED pre-fix: edges was always []) ---

  it('builds edges from linkages.json by exact label match', async () => {
    fs.writeFileSync(
      path.join(changeDir, 'specs', 'auth', 'spec.md'),
      '### Requirement: User Login\nUsers SHALL log in.\n'
    );
    fs.writeFileSync(path.join(changeDir, 'design.md'), '### Decision 1: Use JWT Tokens\n');
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '- [ ] 1.1 Implement login endpoint\n');
    fs.writeFileSync(
      path.join(changeDir, 'linkages.json'),
      JSON.stringify([
        { source: 'User Login', target: 'Decision 1: Use JWT Tokens' },
        { source: 'Decision 1: Use JWT Tokens', target: '1.1 Implement login endpoint' },
      ])
    );

    const dag = await getChangeDag(repo, 'my-change');

    // The full design.md label is "Use JWT Tokens" (node label drops the
    // "Decision 1:" prefix), so the decision endpoint needs fuzzy matching;
    // assert the exact-match edge lands on node IDs, not labels.
    expect(dag.edges).toContainEqual({ source: 'req-user-login', target: 'dec-use-jwt-tokens' });
    expect(dag.edges).toContainEqual({ source: 'dec-use-jwt-tokens', target: expect.any(String) });
    // Every edge endpoint must reference an existing node id.
    const ids = new Set(dag.nodes.map((n) => n.id));
    for (const e of dag.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it('matches linkage endpoints fuzzily (LLM wording drift), per the repo convention', async () => {
    fs.writeFileSync(
      path.join(changeDir, 'specs', 'auth', 'spec.md'),
      '### Requirement: Persist Provider Selection\n'
    );
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), '- [ ] 1.1 Implement change config writing utility\n');
    fs.writeFileSync(
      path.join(changeDir, 'linkages.json'),
      JSON.stringify([
        // Wild linkages.json drifts in wording vs the spec/tasks text.
        { source: 'Persist Provider Selection', target: '1.1 Implement change config writing utility in repoService.ts to write agentProvider setting' },
      ])
    );

    const dag = await getChangeDag(repo, 'my-change');
    expect(dag.edges).toHaveLength(1);
    expect(dag.edges[0].source).toBe('req-persist-provider-selection');
  });

  it('skips linkage endpoints that match no node', async () => {
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# Proposal\n');
    fs.writeFileSync(
      path.join(changeDir, 'linkages.json'),
      JSON.stringify([
        { source: 'Nonexistent Requirement Alpha', target: 'Nonexistent Task Beta' },
        { source: 'Proposal Document', target: 'Nonexistent Task Beta' },
      ])
    );

    const dag = await getChangeDag(repo, 'my-change');
    expect(dag.edges).toEqual([]);
  });

  it('returns empty edges when linkages.json is absent or malformed', async () => {
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# Proposal\n');
    const dagNoFile = await getChangeDag(repo, 'my-change');
    expect(dagNoFile.edges).toEqual([]);

    fs.writeFileSync(path.join(changeDir, 'linkages.json'), '{not json');
    const dagBad = await getChangeDag(repo, 'my-change');
    expect(dagBad.edges).toEqual([]);
  });

  // --- L1: duplicate node ids (RED pre-fix: two spec files with the same
  // requirement label produced two nodes with the same id) ---

  it('disambiguates duplicate requirement labels across spec files', async () => {
    fs.mkdirSync(path.join(changeDir, 'specs', 'billing'), { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'specs', 'auth', 'spec.md'), '### Requirement: Rate Limiting\n');
    fs.writeFileSync(path.join(changeDir, 'specs', 'billing', 'spec.md'), '### Requirement: Rate Limiting\n');

    const dag = await getChangeDag(repo, 'my-change');
    const ids = dag.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id.startsWith('req-rate-limiting'))).toHaveLength(2);
  });
});
