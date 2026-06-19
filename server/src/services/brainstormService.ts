import fs from 'fs';
import path from 'path';
import { createNewChange } from './repoService.js';

/**
 * Recursively reads all markdown specs under openspec/specs/
 */
export function getMainSpecsContent(repoPath: string): string {
  const resolvedRepoPath = path.resolve(repoPath);
  const specsDir = path.join(resolvedRepoPath, 'openspec', 'specs');

  if (!fs.existsSync(specsDir)) {
    return ''; // No specs yet
  }

  let result = '';

  function readDirectory(dir: string, relativeDir: string = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        readDirectory(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        result += `=== SPEC FILE: ${relPath} ===\n${fileContent}\n\n`;
      }
    }
  }

  readDirectory(specsDir);
  return result;
}

interface BrainstormFiles {
  proposal?: string;
  design?: string;
  tasks?: string;
  specs?: Record<string, string>;
}

/**
 * Initializes a new OpenSpec change and populates its files with brainstormed content
 */
export async function commitBrainstormChange(
  repoPath: string,
  changeName: string,
  files: BrainstormFiles
): Promise<void> {
  const resolvedRepoPath = path.resolve(repoPath);

  // 1. Create standard change structure using standard helper
  await createNewChange(resolvedRepoPath, changeName, 'spec-driven');

  const changeDir = path.join(resolvedRepoPath, 'openspec', 'changes', changeName);

  // 2. Overwrite default files with brainstormed contents
  if (files.proposal) {
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), files.proposal, 'utf8');
  }
  if (files.design) {
    fs.writeFileSync(path.join(changeDir, 'design.md'), files.design, 'utf8');
  }
  if (files.tasks) {
    fs.writeFileSync(path.join(changeDir, 'tasks.md'), files.tasks, 'utf8');
  }

  // 3. Write spec files recursively
  if (files.specs) {
    for (const [relPath, content] of Object.entries(files.specs)) {
      const fullSpecPath = path.join(changeDir, relPath);
      fs.mkdirSync(path.dirname(fullSpecPath), { recursive: true });
      fs.writeFileSync(fullSpecPath, content, 'utf8');
    }
  }
}
