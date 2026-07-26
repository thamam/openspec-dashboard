import fs from 'fs';
import path from 'path';
import { resolvePath } from './repoService.js';
import { parseTasks } from './markdownParser.js';

export interface BMADChangeItem {
  id: string;
  title: string;
  status: string;
  framework: 'bmad';
  sprintPath: string;
}

export interface BMADArtifactResult {
  artifacts: {
    proposal: string;
    spec: string;
    design: string;
    tasks: string;
    linkages: Array<{ source: string; target: string }>;
    framework: 'bmad';
  };
  parsedTasks: any[];
  files: string[];
  linkages: Array<{ source: string; target: string }>;
  agentProvider: string;
}

/**
 * Checks if the target repository contains BMAD framework files or planning outputs.
 */
export function isBMADWorkspace(repoPath: string): boolean {
  const resolved = resolvePath(repoPath);
  if (!fs.existsSync(resolved)) return false;

  const candidates = [
    '_bmad-output',
    'bmad-output',
    '_bmad',
    '.bmad',
    'docs/planning-artifacts',
  ];

  return candidates.some((cand) => fs.existsSync(path.join(resolved, cand)));
}

/**
 * Scans a BMAD workspace and returns detected sprint/planning increments as changes.
 */
export function getBMADSprints(repoPath: string): BMADChangeItem[] {
  const resolved = resolvePath(repoPath);
  const sprintList: BMADChangeItem[] = [];

  const planningDirs = [
    path.join(resolved, '_bmad-output', 'planning-artifacts'),
    path.join(resolved, 'bmad-output', 'planning-artifacts'),
    path.join(resolved, 'docs', 'planning-artifacts'),
    path.join(resolved, 'planning-artifacts'),
  ];

  for (const pDir of planningDirs) {
    if (!fs.existsSync(pDir)) continue;

    try {
      const entries = fs.readdirSync(pDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sprintPath = path.join(pDir, entry.name);
          const title = deriveSprintTitle(sprintPath, entry.name);

          sprintList.push({
            id: entry.name,
            title,
            status: 'In Progress',
            framework: 'bmad',
            sprintPath,
          });
        }
      }
    } catch (err) {
      console.error(`Error reading BMAD planning dir ${pDir}:`, err);
    }
  }

  return sprintList;
}

/**
 * Helper to derive a human-friendly title for a BMAD sprint folder.
 */
function deriveSprintTitle(sprintFolder: string, defaultId: string): string {
  try {
    const files = fs.readdirSync(sprintFolder);
    const kickoffFile = files.find((f) => f.toUpperCase().endsWith('-KICKOFF.MD') || f.toUpperCase() === 'KICKOFF.MD');

    if (kickoffFile) {
      const content = fs.readFileSync(path.join(sprintFolder, kickoffFile), 'utf8');
      const h1Match = content.match(/^#\s+(.+)$/m);
      if (h1Match) return h1Match[1].trim();
    }

    const epicsFile = files.find((f) => f.toLowerCase() === 'epics.md');
    if (epicsFile) {
      const content = fs.readFileSync(path.join(sprintFolder, epicsFile), 'utf8');
      const h1Match = content.match(/^#\s+(.+)$/m);
      if (h1Match) return h1Match[1].trim();
    }
  } catch (e) {
    // Ignore and fallback
  }

  // Formatting defaultId like "sprint-4.5" -> "Sprint 4.5"
  return defaultId
    .replace(/^sprint-/, 'Sprint ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Reads and maps BMAD sprint artifacts into canonical SDD structures.
 */
export function getBMADArtifacts(repoPath: string, sprintId: string): BMADArtifactResult {
  const resolved = resolvePath(repoPath);
  const sprints = getBMADSprints(resolved);
  const sprint = sprints.find((s) => s.id === sprintId);

  const sprintPath = sprint
    ? sprint.sprintPath
    : path.join(resolved, '_bmad-output', 'planning-artifacts', sprintId);

  if (!fs.existsSync(sprintPath)) {
    throw new Error(`BMAD sprint planning directory not found: ${sprintId}`);
  }

  let proposal = '';
  let design = '';
  let tasks = '';
  let spec = '';
  const files: string[] = [];
  const linkages: Array<{ source: string; target: string }> = [];

  const sprintFiles = fs.readdirSync(sprintPath);
  for (const file of sprintFiles) {
    files.push(file);
    const fullPath = path.join(sprintPath, file);
    const lowerName = file.toLowerCase();

    if (lowerName.endsWith('-kickoff.md') || lowerName === 'kickoff.md') {
      proposal = fs.readFileSync(fullPath, 'utf8');
    } else if (lowerName === '.memlog.md' || lowerName === 'memlog.md') {
      design += (design ? '\n\n---\n\n' : '') + fs.readFileSync(fullPath, 'utf8');
    } else if (lowerName === 'architecture.md' || lowerName.includes('architecture')) {
      design += (design ? '\n\n---\n\n' : '') + fs.readFileSync(fullPath, 'utf8');
    } else if (lowerName === 'epics.md' || lowerName.includes('epic')) {
      const epicsContent = fs.readFileSync(fullPath, 'utf8');
      tasks += epicsContent;
      spec += (spec ? '\n\n---\n\n' : '') + epicsContent;
    } else if (lowerName.endsWith('.md')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (!proposal) proposal = content;
      else spec += '\n\n---\n\n' + content;
    }
  }

  // If no separate architecture file in sprint folder, check root planning artifacts
  if (!design) {
    const rootArchPath = path.join(resolved, '_bmad-output', 'planning-artifacts', 'architecture.md');
    if (fs.existsSync(rootArchPath)) {
      design = fs.readFileSync(rootArchPath, 'utf8');
    }
  }

  // Synthesize semantic linkages from BMAD Stories and Architecture Decisions
  synthesizeBMADLinkages(tasks, proposal, design, linkages);

  // Parse task checklist items for TaskHub
  const parsedTasks = tasks ? parseTasks(tasks) : [];

  return {
    artifacts: {
      proposal,
      spec,
      design,
      tasks,
      linkages,
      framework: 'bmad',
    },
    parsedTasks,
    files,
    linkages,
    agentProvider: 'antigravity',
  };
}

/**
 * Extracts story IDs and architecture decision topics from text to build the linkages graph.
 */
function synthesizeBMADLinkages(
  tasksText: string,
  proposalText: string,
  designText: string,
  linkages: Array<{ source: string; target: string }>
) {
  // Extract Story headers (e.g. ### Story 11.1: Video decoder manifest...)
  const storyMatches = Array.from(tasksText.matchAll(/###\s+(Story\s+[\w.]+[:\s]*[^\n]+)/gi));
  const decisionsMatches = Array.from(designText.matchAll(/(?:type:\s*decision\s*\|\s*text:\s*|##\s*Architecture Decisions|^\s*-\s*\*\*|\d+\.\s+\*\*)([^\n\.\:\*]+)/gmi));

  const decisions: string[] = [];
  for (const m of decisionsMatches) {
    const clean = m[1].trim();
    if (clean.length > 5 && !decisions.includes(clean)) {
      decisions.push(clean);
    }
  }

  if (storyMatches.length > 0 && decisions.length > 0) {
    storyMatches.forEach((match, idx) => {
      const storyTitle = match[1].split(':')[0].trim();
      const targetDecision = decisions[idx % decisions.length];
      linkages.push({
        source: storyTitle,
        target: targetDecision,
      });
    });
  } else if (storyMatches.length > 0) {
    storyMatches.forEach((match) => {
      const storyTitle = match[1].trim();
      linkages.push({
        source: storyTitle,
        target: 'Sprint Mission & Architecture Contract',
      });
    });
  }
}
