import fs from 'fs';
import path from 'path';
import { parseTasks } from './markdownParser.js';
import { resolvePath } from './repoService.js';

export interface DagNode {
  id: string;
  label: string;
  type: 'proposal' | 'spec-requirement' | 'spec-scenario' | 'design-decision' | 'task';
  status?: 'pending' | 'completed';
  scenariosCount?: number;
  description?: string;
  capability?: string;
  complexityAlert?: string;
  couplingAlert?: string;
}

export interface DagEdge {
  source: string;
  target: string;
}

export async function getChangeDag(
  repoPath: string,
  changeName: string
): Promise<{ nodes: DagNode[]; edges: DagEdge[]; complexity?: any }> {
  const resolvedPath = resolvePath(repoPath);
  const changeDir = path.join(resolvedPath, 'openspec', 'changes', changeName);

  if (!fs.existsSync(changeDir)) {
    throw new Error(`Change directory not found: ${changeName}`);
  }

  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];

  // L1: node ids must be unique — the same requirement label can appear in
  // several spec files (specs/<capability>/spec.md), which slugged to the
  // same id. Suffix collisions: req-foo, req-foo-2, ...
  const usedIds = new Set<string>();
  const pushNode = (node: DagNode) => {
    let id = node.id;
    for (let n = 2; usedIds.has(id); n++) id = `${node.id}-${n}`;
    usedIds.add(id);
    nodes.push({ ...node, id });
  };

  // Parse proposal.md
  const proposalPath = path.join(changeDir, 'proposal.md');
  if (fs.existsSync(proposalPath)) {
    pushNode({
      id: 'proposal-doc',
      label: 'Proposal Document',
      type: 'proposal',
      description: 'Main capability proposal'
    });
  }

  // Parse specs
  const specsDir = path.join(changeDir, 'specs');
  if (fs.existsSync(specsDir)) {
    const recurseSpecs = (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          recurseSpecs(fullPath);
        } else if (file.endsWith('.md')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (const line of lines) {
            const reqMatch = line.match(/^###\s+Requirement:\s*(.+)$/i);
            if (reqMatch) {
              const label = reqMatch[1].trim();
              pushNode({
                id: `req-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                label,
                type: 'spec-requirement',
                description: line
              });
            }
          }
        }
      }
    };
    recurseSpecs(specsDir);
  }

  // Parse design.md
  const designPath = path.join(changeDir, 'design.md');
  if (fs.existsSync(designPath)) {
    const content = fs.readFileSync(designPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const decMatch = line.match(/^###\s+Decision\s*\d*\s*[:—–-]\s*(.+)$/i);
      if (decMatch) {
        const label = decMatch[1].trim();
        pushNode({
          id: `dec-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          label,
          type: 'design-decision',
          description: line
        });
      }
    }
  }

  // Parse tasks.md using parseTasks
  const tasksPath = path.join(changeDir, 'tasks.md');
  if (fs.existsSync(tasksPath)) {
    const content = fs.readFileSync(tasksPath, 'utf-8');
    const parsedTasks = parseTasks(content);
    for (const task of parsedTasks) {
      pushNode({
        id: task.id,
        label: task.title,
        type: 'task',
        status: task.status === 'done' ? 'completed' : 'pending',
        description: `Task for ${task.title}`
      });
    }
  }

  // L1: build edges from the change's linkages.json (the same traceability
  // file /api/artifacts serves). Linkage endpoints are free-text LABELS, not
  // node ids, and drift from artifact wording — match exact label first, then
  // the repo's fuzzy convention (AGENTS.md / client linkages.ts):
  // case-insensitive substring in either direction, both sides >= 5 chars.
  const linkagesPath = path.join(changeDir, 'linkages.json');
  if (fs.existsSync(linkagesPath)) {
    let linkages: Array<{ source?: unknown; target?: unknown }> = [];
    try {
      const parsed = JSON.parse(fs.readFileSync(linkagesPath, 'utf-8'));
      if (Array.isArray(parsed)) linkages = parsed;
    } catch {
      // Malformed linkages.json must not break the DAG — no edges from it.
    }

    const fuzzyMatch = (a: string, b: string) => {
      if (a.length < 5 || b.length < 5) return false;
      const la = a.toLowerCase();
      const lb = b.toLowerCase();
      return la.includes(lb) || lb.includes(la);
    };
    // Exact label match wins and returns ALL matches — a duplicated
    // requirement label (suffixed req-foo-2) stays reachable as an endpoint.
    // Fuzzy falls back to the LONGEST matching label (most specific), so a
    // short requirement label doesn't silently win over the intended task.
    const resolveEndpoints = (label: unknown): string[] => {
      if (typeof label !== 'string' || !label) return [];
      const exact = nodes.filter((n) => n.label === label).map((n) => n.id);
      if (exact.length) return exact;
      let best: DagNode | null = null;
      for (const n of nodes) {
        if (!fuzzyMatch(n.label, label)) continue;
        if (!best || n.label.length > best.label.length) best = n;
      }
      return best ? [best.id] : [];
    };

    const seenEdges = new Set<string>();
    for (const link of linkages) {
      for (const source of resolveEndpoints(link.source)) {
        for (const target of resolveEndpoints(link.target)) {
          if (source === target) continue;
          const key = `${source}→${target}`;
          if (seenEdges.has(key)) continue;
          seenEdges.add(key);
          edges.push({ source, target });
        }
      }
    }
  }

  // Simple complexity rating
  const taskCount = nodes.filter(n => n.type === 'task').length;
  const rating = taskCount > 8 ? 'High' : taskCount > 4 ? 'Medium' : 'Low';
  
  return {
    nodes,
    edges,
    complexity: {
      rating,
      component: taskCount,
      coordinative: taskCount * 0.5
    }
  };
}
