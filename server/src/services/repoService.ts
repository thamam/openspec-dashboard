import fs from 'fs';
import path from 'path';
import os from 'os';

export function resolvePath(targetPath: string): string {
  if (!targetPath) return targetPath;
  if (targetPath === '~') {
    return os.homedir();
  }
  if (targetPath.startsWith('~/') || targetPath.startsWith('~\\')) {
    return path.join(os.homedir(), targetPath.slice(2));
  }
  return path.resolve(targetPath);
}

export interface WorktreeInfo {
  path: string;
  branch: string | null;
  isMain: boolean;
}

export interface RepoStatus {
  exists: boolean;
  isGit: boolean;
  isOpenSpec: boolean;
  repoRoot?: string;
  isTraceReady?: boolean;
  worktrees?: WorktreeInfo[];
}

export async function checkRepoStatus(dirPath: string): Promise<RepoStatus> {
  let resolvedPath = resolvePath(dirPath);

  // 1. Check if path exists
  if (!fs.existsSync(resolvedPath)) {
    return { exists: false, isGit: false, isOpenSpec: false };
  }

  // If path is a file, use its parent directory
  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      resolvedPath = path.dirname(resolvedPath);
    }
  } catch {
    return { exists: false, isGit: false, isOpenSpec: false };
  }

  // Traverse upwards to find .git
  let currentDir = resolvedPath;
  let repoRoot: string | undefined = undefined;

  while (true) {
    const gitPath = path.join(currentDir, '.git');
    if (fs.existsSync(gitPath)) {
      try {
        const gitStat = fs.statSync(gitPath);
        if (gitStat.isDirectory() || gitStat.isFile()) {
          repoRoot = currentDir;
          break;
        }
      } catch {
        // Ignore and check parent
      }
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break; // Reached the root of the filesystem
    }
    currentDir = parent;
  }

  const targetPath = repoRoot || resolvedPath;
  const isGit = !!repoRoot;

  // Check if OpenSpec is initialized at the repository root
  let isOpenSpec = false;
  if (isGit) {
    const openspecDir = path.join(targetPath, 'openspec');
    try {
      const openspecStat = fs.statSync(openspecDir);
      isOpenSpec = openspecStat.isDirectory();
    } catch {
      isOpenSpec = false;
    }
  }

  // Check if target has the updated openspec flow (traceability rules/linkages configured)
  let isTraceReady = false;
  if (isGit) {
    const proposeWorkflowPath = path.join(targetPath, '.agent', 'workflows', 'opsx-propose.md');
    let worktrees: WorktreeInfo[] | undefined;
    if (fs.existsSync(proposeWorkflowPath)) {
      try {
        const content = fs.readFileSync(proposeWorkflowPath, 'utf8');
        isTraceReady = content.includes('Generate Explicit Linkages') || content.includes('linkages.json');
      } catch {
        isTraceReady = false;
      }
    }
    worktrees = await getConnectedWorktrees(targetPath);
    return {
      exists: true,
      isGit,
      isOpenSpec,
      repoRoot: targetPath,
      isTraceReady,
      worktrees,
    };
  }

  return {
    exists: true,
    isGit,
    isOpenSpec,
    repoRoot: targetPath,
    isTraceReady: false,
  };
}

import { execFile } from 'child_process';

function execFilePromise(file: string, args: string[], cwd: string): Promise<string> {
  const extraPaths = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];

  // Dynamically locate NVM installations
  const homeDir = process.env.HOME || '/Users/tomerhamam';
  const nvmDir = process.env.NVM_DIR || path.join(homeDir, '.nvm');
  try {
    if (fs.existsSync(nvmDir)) {
      const versionsDir = path.join(nvmDir, 'versions', 'node');
      if (fs.existsSync(versionsDir)) {
        const versions = fs.readdirSync(versionsDir);
        for (const ver of versions) {
          extraPaths.push(path.join(versionsDir, ver, 'bin'));
        }
      }
    }
  } catch (e) {
    // Ignore and proceed
  }

  const currentPath = process.env.PATH || '';
  const mergedPath = [...extraPaths, ...currentPath.split(':')]
    .filter((val, idx, self) => val && self.indexOf(val) === idx)
    .join(':');

  return new Promise((resolve, reject) => {
    // execFile spawns the binary directly (no shell): argv elements are passed
    // verbatim, so interpolated values can never be reinterpreted as shell syntax.
    execFile(file, args, {
      cwd,
      env: {
        ...process.env,
        PATH: mergedPath
      }
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || stdout.trim() || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

const CLI_NAME_RE = /^[a-zA-Z0-9.-]+$/;

/**
 * Names that become CLI argv elements must also not start with '-' — without a
 * shell the next reinterpretation layer is the target binary's own option
 * parser, which would read a leading-dash value as a flag.
 */
function isSafeCliName(value: string): boolean {
  return typeof value === 'string' && CLI_NAME_RE.test(value) && !value.startsWith('-');
}

export async function getConnectedWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  try {
    const output = await execFilePromise('git', ['worktree', 'list', '--porcelain'], repoPath);
    const blocks = output.trim().split('\n\n');
    const worktrees: WorktreeInfo[] = [];

    blocks.forEach((block, index) => {
      const lines = block.split('\n');
      let wtPath = '';
      let branch = '';
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wtPath = line.substring(9).trim();
        } else if (line.startsWith('branch ')) {
          branch = line.substring(7).trim().replace('refs/heads/', '');
        }
      }
      if (wtPath) {
        worktrees.push({
          path: wtPath,
          branch: branch || null,
          isMain: index === 0
        });
      }
    });
    return worktrees;
  } catch (err) {
    console.error('Failed to list git worktrees:', err);
    return [];
  }
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
  const resolvedPath = resolvePath(dirPath);
  
  // Verify it exists and is a git repo first
  const status = await checkRepoStatus(resolvedPath);
  if (!status.exists || !status.isGit) {
    throw new Error('Target path is not a valid Git repository');
  }

  await execFilePromise('openspec', ['init', '--tools', 'none'], resolvedPath);

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
  const resolvedRepoPath = resolvePath(repoPath);
  const resolvedWorktreePath = resolvePath(worktreePath);

  // Validate branch name ('/' allowed for feature branches, but no leading '-'
  // so git's option parser cannot re-read it as a flag)
  const branchRegex = /^[a-zA-Z0-9._/-]+$/;
  if (!branchRegex.test(branchName) || branchName.startsWith('-')) {
    throw new Error('Invalid branch name format');
  }

  // Verify repo path exists and is a git repository
  const status = await checkRepoStatus(resolvedRepoPath);
  if (!status.exists || !status.isGit) {
    throw new Error('Source path is not a valid Git repository');
  }

  // Run git worktree add. '--' ends git's option parsing so a worktree path
  // starting with '-' cannot be reinterpreted as a flag (verified vs real git).
  await execFilePromise('git', ['worktree', 'add', '-b', branchName, '--', resolvedWorktreePath], resolvedRepoPath);
}

export async function createLocalSchema(
  repoPath: string,
  schemaName: string,
  artifacts: string[]
): Promise<void> {
  const resolvedRepoPath = resolvePath(repoPath);

  // Validate inputs
  if (!isSafeCliName(schemaName)) {
    throw new Error('Invalid schema name format');
  }
  // Artifacts are joined into one --artifacts value, so each must be a safe
  // CLI name (this also blocks ',' which would smuggle in extra names).
  for (const artifact of artifacts) {
    if (!isSafeCliName(artifact)) {
      throw new Error('Invalid artifact name format');
    }
  }

  // Verify it exists and is a git repo first
  const status = await checkRepoStatus(resolvedRepoPath);
  if (!status.exists || !status.isGit) {
    throw new Error('Target path is not a valid Git repository');
  }

  const artifactsList = artifacts.join(',');
  await execFilePromise(
    'openspec',
    ['schema', 'init', schemaName, '--artifacts', artifactsList, '--no-default'],
    resolvedRepoPath
  );
}

export function parseYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const colonIndex = clean.indexOf(':');
    if (colonIndex !== -1) {
      const key = clean.substring(0, colonIndex).trim();
      let value = clean.substring(colonIndex + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      result[key] = value;
    }
  }
  return result;
}

export function stringifyYaml(data: Record<string, string | undefined>): string {
  let content = '';
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      const escaped = value.includes('"') ? value.replace(/"/g, '\\"') : value;
      content += `${key}: "${escaped}"\n`;
    }
  }
  return content;
}

export async function createNewChange(
  repoPath: string,
  changeName: string,
  schemaName: string = 'spec-driven',
  description?: string,
  proposeEngine?: string
): Promise<void> {
  const resolvedRepoPath = resolvePath(repoPath);

  // Validate inputs
  if (!isSafeCliName(changeName)) {
    throw new Error('Invalid change name format');
  }
  if (!isSafeCliName(schemaName)) {
    throw new Error('Invalid schema name format');
  }
  if (proposeEngine && !isSafeCliName(proposeEngine)) {
    throw new Error('Invalid propose engine format');
  }

  // Verify it exists and is a git repo first
  const status = await checkRepoStatus(resolvedRepoPath);
  if (!status.exists || !status.isGit) {
    throw new Error('Target path is not a valid Git repository');
  }

  // No shell: the description is a single literal argv token, so '$()',
  // backticks and quotes in it cannot execute and need no escaping. The
  // --flag=<value> form keeps even a leading '-' in the text from being
  // re-read as a flag by openspec's option parser.
  const args = ['new', 'change', changeName, '--schema', schemaName];
  if (description) {
    args.push(`--description=${description}`);
  }

  await execFilePromise('openspec', args, resolvedRepoPath);

  // Read generated .openspec.yaml and append proposeEngine (defaults to 'gemini')
  const changeConfigFile = path.join(resolvedRepoPath, 'openspec', 'changes', changeName, '.openspec.yaml');
  if (fs.existsSync(changeConfigFile)) {
    const yamlContent = fs.readFileSync(changeConfigFile, 'utf8');
    const data = parseYaml(yamlContent);
    data.proposeEngine = proposeEngine || 'gemini';
    fs.writeFileSync(changeConfigFile, stringifyYaml(data), 'utf8');
  }
}

export interface ChangeMetadata {
  name: string;
  schema: string;
  created: string;
  description: string;
  proposeEngine: string;
  agentProvider: string;
  worktreeBranch?: string | null;
}

export async function getChangeWorktree(repoPath: string, changeName: string): Promise<string | null> {
  try {
    const output = await execFilePromise('git', ['worktree', 'list', '--porcelain'], repoPath);
    const blocks = output.split('\n\n');
    for (const block of blocks) {
      const lines = block.split('\n');
      let worktreePath = '';
      let branch = '';
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          worktreePath = line.substring(9).trim();
        } else if (line.startsWith('branch ')) {
          branch = line.substring(7).trim(); // refs/heads/branch-name
        }
      }
      const shortBranch = branch.replace('refs/heads/', '');
      if (
        shortBranch === changeName ||
        shortBranch.includes(changeName) ||
        worktreePath.endsWith(changeName) ||
        worktreePath.includes(`/${changeName}`)
      ) {
        return shortBranch;
      }
    }
  } catch (err) {
    console.error('Failed to list git worktrees:', err);
  }
  return null;
}

export async function runProposeCommand(
  repoPath: string,
  changeName: string,
  engine: string
): Promise<string> {
  const resolvedRepoPath = resolvePath(repoPath);
  // Validate before spawning — previously these reached a shell string with no
  // validation at all.
  if (!isSafeCliName(changeName)) {
    throw new Error('Invalid change name format');
  }
  if (!isSafeCliName(engine)) {
    throw new Error('Invalid engine format');
  }
  return await execFilePromise('openspec', ['propose', changeName, '--engine', engine], resolvedRepoPath);
}

export async function getChangeMetadata(
  repoPath: string,
  changeName: string
): Promise<ChangeMetadata> {
  const resolvedRepoPath = resolvePath(repoPath);
  const changeDir = path.join(resolvedRepoPath, 'openspec', 'changes', changeName);
  
  if (!fs.existsSync(changeDir)) {
    throw new Error(`Change directory not found: ${changeName}`);
  }

  const changeConfigFile = path.join(changeDir, '.openspec.yaml');
  let schema = 'spec-driven';
  let created = '';
  let description = '';
  let proposeEngine = 'gemini';
  let agentProvider = 'antigravity';

  if (fs.existsSync(changeConfigFile)) {
    const yamlContent = fs.readFileSync(changeConfigFile, 'utf8');
    const data = parseYaml(yamlContent);
    if (data.schema) schema = data.schema;
    if (data.created) created = data.created;
    if (data.description) description = data.description;
    if (data.proposeEngine) proposeEngine = data.proposeEngine;
    if (data.agentProvider) agentProvider = data.agentProvider;
  }

  // If description was not in yaml, we can check if it exists in README.md
  const readmeFile = path.join(changeDir, 'README.md');
  if (fs.existsSync(readmeFile) && !description) {
    const readmeContent = fs.readFileSync(readmeFile, 'utf8');
    const match = readmeContent.match(/^#\s+[^\n]+\n+([\s\S]+)$/m);
    if (match) {
      description = match[1].trim();
    }
  }

  const worktreeBranch = await getChangeWorktree(resolvedRepoPath, changeName);

  return {
    name: changeName,
    schema,
    created,
    description,
    proposeEngine,
    agentProvider,
    worktreeBranch,
  };
}

export async function updateProposeEngine(
  repoPath: string,
  changeName: string,
  proposeEngine: string
): Promise<void> {
  const resolvedRepoPath = resolvePath(repoPath);
  const nameRegex = /^[a-zA-Z0-9.-]+$/;
  if (!nameRegex.test(proposeEngine)) {
    throw new Error('Invalid propose engine format');
  }

  const changeConfigFile = path.join(resolvedRepoPath, 'openspec', 'changes', changeName, '.openspec.yaml');
  if (!fs.existsSync(changeConfigFile)) {
    throw new Error(`Change configuration file not found for change: ${changeName}`);
  }

  const yamlContent = fs.readFileSync(changeConfigFile, 'utf8');
  const data = parseYaml(yamlContent);
  data.proposeEngine = proposeEngine;
  fs.writeFileSync(changeConfigFile, stringifyYaml(data), 'utf8');
}

export async function updateChangeProvider(
  repoPath: string,
  changeName: string,
  agentProvider: string
): Promise<void> {
  const resolvedRepoPath = resolvePath(repoPath);
  const nameRegex = /^[a-zA-Z0-9.-]+$/;
  if (!nameRegex.test(agentProvider)) {
    throw new Error('Invalid agent provider format');
  }

  const changeConfigFile = path.join(resolvedRepoPath, 'openspec', 'changes', changeName, '.openspec.yaml');
  if (!fs.existsSync(changeConfigFile)) {
    throw new Error(`Change configuration file not found for change: ${changeName}`);
  }

  const yamlContent = fs.readFileSync(changeConfigFile, 'utf8');
  const data = parseYaml(yamlContent);
  data.agentProvider = agentProvider;
  fs.writeFileSync(changeConfigFile, stringifyYaml(data), 'utf8');
}

export function getChangeFilesContent(
  repoPath: string,
  changeName: string
): string {
  const resolvedRepoPath = resolvePath(repoPath);
  const changeDir = path.join(resolvedRepoPath, 'openspec', 'changes', changeName);

  if (!fs.existsSync(changeDir)) {
    throw new Error(`Change directory not found: ${changeName}`);
  }

  let result = '';

  function readDirectory(dir: string, relativeDir: string = '') {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

      if (entry.isDirectory()) {
        readDirectory(fullPath, relPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        result += `=== FILE: ${relPath} ===\n${fileContent}\n\n`;
      }
    }
  }

  readDirectory(changeDir);
  return result;
}


