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
 * Scans a BMAD workspace and returns detected sprint/planning/implementation increments as changes.
 */
export function getBMADSprints(repoPath: string): BMADChangeItem[] {
  const resolved = resolvePath(repoPath);
  const sprintList: BMADChangeItem[] = [];

  // 1. Single-story implementation artifacts (e.g. 4-1-profile-persistence-spine.md)
  const implDirs = [
    path.join(resolved, '_bmad-output', 'implementation-artifacts'),
    path.join(resolved, 'bmad-output', 'implementation-artifacts'),
  ];

  for (const implDir of implDirs) {
    if (!fs.existsSync(implDir)) continue;
    try {
      const files = fs.readdirSync(implDir);
      for (const f of files) {
        if (f.endsWith('.md') && f !== 'deferred-work.md') {
          const id = f.replace(/\.md$/, '');
          const cleanName = f.replace(/\.md$/, '').replace(/-/g, ' ');
          const title = cleanName.replace(/\b\w/g, (l) => l.toUpperCase());

          sprintList.push({
            id,
            title: `Story ${title}`,
            status: 'In Progress',
            framework: 'bmad',
            sprintPath: path.join(implDir, f),
          });
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  // 2. Epic directories (e.g. _bmad-output/epic-4-2026-07-26)
  const bmadBase = path.join(resolved, '_bmad-output');
  if (fs.existsSync(bmadBase)) {
    try {
      const baseEntries = fs.readdirSync(bmadBase, { withFileTypes: true });
      for (const entry of baseEntries) {
        if (entry.isDirectory() && entry.name.startsWith('epic-')) {
          sprintList.push({
            id: entry.name,
            title: entry.name.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
            status: 'In Progress',
            framework: 'bmad',
            sprintPath: path.join(bmadBase, entry.name),
          });
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  // 3. Traditional planning artifact sprint folders
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

  let proposal = '';
  let design = '';
  let tasks = '';
  let spec = '';
  const files: string[] = [];
  const linkages: Array<{ source: string; target: string }> = [];

  const sprintPath = sprint
    ? sprint.sprintPath
    : path.join(resolved, '_bmad-output', 'implementation-artifacts', `${sprintId}.md`);

  if (!fs.existsSync(sprintPath)) {
    throw new Error(`BMAD artifact path not found: ${sprintId}`);
  }

  const isFile = fs.statSync(sprintPath).isFile();

  if (isFile) {
    // Single-story implementation artifact
    const content = fs.readFileSync(sprintPath, 'utf8');
    files.push(path.basename(sprintPath));
    proposal = content;
    spec = content;
    tasks = content;

    // Look for parent architecture file in epic folder
    const bmadBase = path.join(resolved, '_bmad-output');
    if (fs.existsSync(bmadBase)) {
      try {
        const entries = fs.readdirSync(bmadBase);
        const epicDir = entries.find((e) => e.startsWith('epic-'));
        if (epicDir) {
          const archDir = path.join(bmadBase, epicDir, 'architecture');
          if (fs.existsSync(archDir)) {
            const archFiles = fs.readdirSync(archDir);
            for (const af of archFiles) {
              if (af.endsWith('.md')) {
                design += (design ? '\n\n---\n\n' : '') + fs.readFileSync(path.join(archDir, af), 'utf8');
              }
            }
          }
        }
      } catch (e) {
        // Ignore
      }
    }
  } else {
    // Directory artifact (sprint or epic directory)
    const readDirRecursive = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          readDirRecursive(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(entry.name);
          const lowerName = entry.name.toLowerCase();
          const content = fs.readFileSync(fullPath, 'utf8');

          if (lowerName.endsWith('-kickoff.md') || lowerName === 'kickoff.md') {
            proposal = content;
          } else if (lowerName === '.memlog.md' || lowerName.includes('architecture') || lowerName.includes('spine')) {
            design += (design ? '\n\n---\n\n' : '') + content;
          } else if (lowerName.includes('epic') || lowerName.includes('story')) {
            tasks += (tasks ? '\n\n---\n\n' : '') + content;
            spec += (spec ? '\n\n---\n\n' : '') + content;
          } else {
            if (!proposal) proposal = content;
            else spec += '\n\n---\n\n' + content;
          }
        }
      }
    };

    readDirRecursive(sprintPath);
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
    agentProvider: 'claude-code',
  };
}

/**
 * Synthesizes traceability graph linkages between Stories, Design Decisions, and Tasks.
 */
function synthesizeBMADLinkages(
  tasksText: string,
  proposalText: string,
  designText: string,
  linkages: Array<{ source: string; target: string }>
) {
  const combined = tasksText + '\n' + proposalText + '\n' + designText;
  const lines = combined.split('\n');

  const storyMatches = Array.from(new Set(combined.match(/Story\s+\d+\.\d+|FR-\d+|ADR-\d+|AD-\d+/gi) || []));

  for (let i = 0; i < storyMatches.length - 1; i++) {
    linkages.push({
      source: storyMatches[i],
      target: storyMatches[i + 1],
    });
  }

  if (storyMatches.length === 1) {
    linkages.push({
      source: 'Sprint Baseline',
      target: storyMatches[0],
    });
  }

  for (const line of lines) {
    if (line.includes('-->') || line.includes('->')) {
      const parts = line.split(/-->|->/);
      if (parts.length === 2) {
        const src = parts[0].trim().replace(/^[-*#\d\s]+/, '');
        const tgt = parts[1].trim();
        if (src.length > 3 && tgt.length > 3) {
          linkages.push({ source: src, target: tgt });
        }
      }
    }
  }
}
