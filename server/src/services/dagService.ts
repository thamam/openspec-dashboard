import fs from 'fs';
import path from 'path';
import { parseTasks } from './markdownParser.js';

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

export async function getChanges(repoPath: string): Promise<string[]> {
  const resolvedPath = path.resolve(repoPath);
  const changesDir = path.join(resolvedPath, 'openspec', 'changes');

  if (!fs.existsSync(changesDir)) {
    return [];
  }

  const results: string[] = [];

  const activeItems = fs.readdirSync(changesDir);
  for (const item of activeItems) {
    const itemPath = path.join(changesDir, item);
    if (item !== 'archive' && fs.statSync(itemPath).isDirectory()) {
      results.push(item);
    }
  }

  const archiveDir = path.join(changesDir, 'archive');
  if (fs.existsSync(archiveDir) && fs.statSync(archiveDir).isDirectory()) {
    const archivedItems = fs.readdirSync(archiveDir);
    for (const item of archivedItems) {
      const itemPath = path.join(archiveDir, item);
      if (fs.statSync(itemPath).isDirectory()) {
        results.push(`archive/${item}`);
      }
    }
  }

  return results;
}

export async function getChangeDag(
  repoPath: string,
  changeName: string
): Promise<{ nodes: DagNode[]; edges: DagEdge[]; complexity?: any }> {
  const resolvedPath = path.resolve(repoPath);
  const changeDir = path.join(resolvedPath, 'openspec', 'changes', changeName);

  if (!fs.existsSync(changeDir)) {
    throw new Error(`Change directory not found: ${changeName}`);
  }

  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];

  // Parse proposal.md
  const proposalPath = path.join(changeDir, 'proposal.md');
  if (fs.existsSync(proposalPath)) {
    nodes.push({
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
              nodes.push({
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
        nodes.push({
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
      nodes.push({
        id: task.id,
        label: task.title,
        type: 'task',
        status: task.status === 'done' ? 'completed' : 'pending',
        description: `Task for ${task.title}`
      });
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
