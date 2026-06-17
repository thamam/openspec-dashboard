import fs from 'fs';
import path from 'path';

export interface RepoStatus {
  exists: boolean;
  isGit: boolean;
  isOpenSpec: boolean;
}

export async function checkRepoStatus(dirPath: string): Promise<RepoStatus> {
  const resolvedPath = path.resolve(dirPath);

  // 1. Check if path exists and is a directory
  if (!fs.existsSync(resolvedPath)) {
    return { exists: false, isGit: false, isOpenSpec: false };
  }

  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return { exists: false, isGit: false, isOpenSpec: false };
    }
  } catch {
    return { exists: false, isGit: false, isOpenSpec: false };
  }

  // 2. Check if it is a Git repository
  const gitPath = path.join(resolvedPath, '.git');
  let isGit = false;
  if (fs.existsSync(gitPath)) {
    try {
      const gitStat = fs.statSync(gitPath);
      isGit = gitStat.isDirectory();
    } catch {
      isGit = false;
    }
  }

  // 3. Check if OpenSpec is initialized
  let isOpenSpec = false;
  if (isGit) {
    const openspecDir = path.join(resolvedPath, 'openspec');
    try {
      const openspecStat = fs.statSync(openspecDir);
      isOpenSpec = openspecStat.isDirectory();
    } catch {
      isOpenSpec = false;
    }
  }

  return {
    exists: true,
    isGit,
    isOpenSpec,
  };
}

import { exec } from 'child_process';

function execPromise(command: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || stdout.trim() || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function copyDirSync(src: string, dest: string) {
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function findTemplateRoot(): string {
  let current = path.resolve(process.cwd());
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.agent', 'skills'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return path.resolve(process.cwd());
}

const templateRoot = findTemplateRoot();

export async function initializeOpenSpec(dirPath: string): Promise<void> {
  const resolvedPath = path.resolve(dirPath);
  
  // Verify it exists and is a git repo first
  const status = await checkRepoStatus(resolvedPath);
  if (!status.exists || !status.isGit) {
    throw new Error('Target path is not a valid Git repository');
  }

  await execPromise('openspec init --tools none', resolvedPath);

  // Copy .agent, .claude, .codex, .cursor directories
  const directoriesToCopy = ['.agent', '.claude', '.codex', '.cursor'];
  for (const dir of directoriesToCopy) {
    const srcPath = path.join(templateRoot, dir);
    const destPath = path.join(resolvedPath, dir);
    if (fs.existsSync(srcPath)) {
      copyDirSync(srcPath, destPath);
    }
  }
}

export async function createGitWorktree(
  repoPath: string,
  branchName: string,
  worktreePath: string
): Promise<void> {
  const resolvedRepoPath = path.resolve(repoPath);
  const resolvedWorktreePath = path.resolve(worktreePath);

  // Validate branch name
  const branchRegex = /^[a-zA-Z0-9._/-]+$/;
  if (!branchRegex.test(branchName)) {
    throw new Error('Invalid branch name format');
  }

  // Verify repo path exists and is a git repository
  const status = await checkRepoStatus(resolvedRepoPath);
  if (!status.exists || !status.isGit) {
    throw new Error('Source path is not a valid Git repository');
  }

  // Run git worktree add
  await execPromise(`git worktree add -b "${branchName}" "${resolvedWorktreePath}"`, resolvedRepoPath);
}

