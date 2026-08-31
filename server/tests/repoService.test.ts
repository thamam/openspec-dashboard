import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { checkRepoStatus, resolvePath } from '../src/services/repoService.js';

describe('repoService - resolvePath', () => {
  it('should expand tilde (~) to user home directory', () => {
    expect(resolvePath('~')).toBe(os.homedir());
    expect(resolvePath('~/personal/projects')).toBe(path.join(os.homedir(), 'personal/projects'));
  });
});

describe('repoService - checkRepoStatus', () => {
  let tempDir: string;

  beforeAll(() => {
    // Create a base temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-dashboard-test-'));
  });

  afterAll(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return exists: false when directory does not exist', async () => {
    const nonExistentPath = path.join(tempDir, 'does-not-exist');
    const result = await checkRepoStatus(nonExistentPath);
    expect(result).toEqual({
      exists: false,
      isGit: false,
      isOpenSpec: false,
    });
  });

  it('should return exists: true, isGit: false, isOpenSpec: false when path is a normal directory', async () => {
    const normalDir = path.join(tempDir, 'normal-dir');
    fs.mkdirSync(normalDir);

    const result = await checkRepoStatus(normalDir);
    expect(result).toEqual({
      exists: true,
      isGit: false,
      isOpenSpec: false,
      repoRoot: path.resolve(normalDir),
      isTraceReady: false,
    });
  });

  it('should return exists: true, isGit: true, isOpenSpec: false when path is a git repo without openspec', async () => {
    const gitDir = path.join(tempDir, 'git-dir');
    fs.mkdirSync(gitDir);
    fs.mkdirSync(path.join(gitDir, '.git'));

    const result = await checkRepoStatus(gitDir);
    expect(result).toEqual({
      exists: true,
      isGit: true,
      isOpenSpec: false,
      repoRoot: path.resolve(gitDir),
      isTraceReady: false,
      worktrees: [],
    });
  });

  it('should return exists: true, isGit: true, isOpenSpec: true when path is a git repo with openspec', async () => {
    const openspecDir = path.join(tempDir, 'openspec-dir');
    fs.mkdirSync(openspecDir);
    fs.mkdirSync(path.join(openspecDir, '.git'));
    fs.mkdirSync(path.join(openspecDir, 'openspec'));
    fs.writeFileSync(path.join(openspecDir, 'openspec', 'config.yaml'), 'schema: spec-driven');

    const result = await checkRepoStatus(openspecDir);
    expect(result).toEqual({
      exists: true,
      isGit: true,
      isOpenSpec: true,
      repoRoot: path.resolve(openspecDir),
      isTraceReady: false,
      worktrees: [],
    });
  });

  it('should return exists: true, isGit: true when path is a git worktree (where .git is a file)', async () => {
    const worktreeDir = path.join(tempDir, 'worktree-dir');
    fs.mkdirSync(worktreeDir);
    fs.writeFileSync(path.join(worktreeDir, '.git'), 'gitdir: /path/to/original/.git/worktrees/worktree-dir');

    const result = await checkRepoStatus(worktreeDir);
    expect(result).toEqual({
      exists: true,
      isGit: true,
      isOpenSpec: false,
      repoRoot: path.resolve(worktreeDir),
      isTraceReady: false,
      worktrees: [],
    });
  });

  it('should traverse upwards to find git repository root from a subdirectory', async () => {
    const gitDir = path.join(tempDir, 'traverse-git-dir');
    fs.mkdirSync(gitDir);
    fs.mkdirSync(path.join(gitDir, '.git'));
    fs.mkdirSync(path.join(gitDir, 'openspec'));
    fs.writeFileSync(path.join(gitDir, 'openspec', 'config.yaml'), 'schema: spec-driven');

    const subDir = path.join(gitDir, 'openspec', 'changes');
    fs.mkdirSync(subDir, { recursive: true });

    const result = await checkRepoStatus(subDir);
    expect(result).toEqual({
      exists: true,
      isGit: true,
      isOpenSpec: true,
      repoRoot: path.resolve(gitDir),
      isTraceReady: false,
      worktrees: [],
    });
  });
});

describe('repoService - initializeOpenSpec & change commands', () => {
  let tempDir: string;
  const { execSync } = require('child_process');

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-dashboard-cmd-test-'));
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should initialize OpenSpec successfully in a git repo', async () => {
    const gitDir = path.join(tempDir, 'git-repo-init');
    fs.mkdirSync(gitDir);
    
    // Initialize actual git repo
    execSync('git init -b main', { cwd: gitDir });

    const { initializeOpenSpec } = await import('../src/services/repoService.js');
    await initializeOpenSpec(gitDir);

    expect(fs.existsSync(path.join(gitDir, 'openspec'))).toBe(true);
    expect(fs.existsSync(path.join(gitDir, '.agent'))).toBe(true);
    expect(fs.existsSync(path.join(gitDir, '.claude'))).toBe(true);
    expect(fs.existsSync(path.join(gitDir, '.codex'))).toBe(true);
    expect(fs.existsSync(path.join(gitDir, '.cursor'))).toBe(true);

    const status = await checkRepoStatus(gitDir);
    expect(status.isOpenSpec).toBe(true);
    expect(status.isTraceReady).toBe(true);
  });

  it('checkRepoStatus lists connected worktrees (real git worktree add)', async () => {
    const gitDir = path.join(tempDir, 'git-repo-worktree');
    fs.mkdirSync(gitDir);

    // Initialize git repo and make an initial commit
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });

    const worktreeDest = path.join(tempDir, 'worktree-dest');
    execSync(`git worktree add -b feature/my-worktree -- "${worktreeDest}"`, { cwd: gitDir });

    // Verify directory exists and has a .git file (worktree pointer)
    expect(fs.existsSync(worktreeDest)).toBe(true);
    expect(fs.existsSync(path.join(worktreeDest, '.git'))).toBe(true);

    // Verify branch exists in the original repo
    const branches = execSync('git branch', { cwd: gitDir }).toString();
    expect(branches).toContain('feature/my-worktree');

    // Verify status returns the connected worktrees (main repo + worktree)
    const status = await checkRepoStatus(gitDir);
    expect(status.worktrees).toBeDefined();
    expect(status.worktrees!.length).toBe(2);
    expect(status.worktrees![0].isMain).toBe(true);
    expect(fs.realpathSync(status.worktrees![0].path)).toBe(fs.realpathSync(gitDir));
    expect(status.worktrees![1].isMain).toBe(false);
    expect(fs.realpathSync(status.worktrees![1].path)).toBe(fs.realpathSync(worktreeDest));
  });

  it('should create a local schema successfully', async () => {
    const gitDir = path.join(tempDir, 'git-repo-schema');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });

    const { initializeOpenSpec, createLocalSchema } = await import('../src/services/repoService.js');
    await initializeOpenSpec(gitDir);
    await createLocalSchema(gitDir, 'custom-flow', ['proposal', 'tasks']);

    expect(fs.existsSync(path.join(gitDir, 'openspec', 'schemas', 'custom-flow', 'schema.yaml'))).toBe(true);
  });

  it('should create a new change successfully with predefined and custom schemas', async () => {
    const gitDir = path.join(tempDir, 'git-repo-change');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });

    const { initializeOpenSpec, createLocalSchema, createNewChange, getChangeMetadata } = await import('../src/services/repoService.js');
    await initializeOpenSpec(gitDir);

    // Create change with predefined schema and a specific engine (claude)
    await createNewChange(gitDir, 'standard-change', 'spec-driven', 'my standard change description', 'claude');
    
    const standardConfigPath = path.join(gitDir, 'openspec', 'changes', 'standard-change', '.openspec.yaml');
    expect(fs.existsSync(standardConfigPath)).toBe(true);
    const { parseChangeConfig } = await import('../src/utils/yamlConfig.js');
    const standardConfig = parseChangeConfig(fs.readFileSync(standardConfigPath, 'utf8'));
    expect(standardConfig.schema).toBe('spec-driven');
    expect(standardConfig.proposeEngine).toBe('claude');

    // Verify metadata retrieval
    const metadata = await getChangeMetadata(gitDir, 'standard-change');
    expect(metadata).toEqual({
      name: 'standard-change',
      schema: 'spec-driven',
      created: expect.any(String),
      description: 'my standard change description',
      proposeEngine: 'claude',
      agentProvider: 'antigravity',
      worktreeBranch: null,
    });

    // Create custom schema first, then create change with it (defaults to gemini engine)
    await createLocalSchema(gitDir, 'my-custom-schema', ['proposal', 'tasks']);
    await createNewChange(gitDir, 'custom-change', 'my-custom-schema');
    
    const customConfigPath = path.join(gitDir, 'openspec', 'changes', 'custom-change', '.openspec.yaml');
    expect(fs.existsSync(customConfigPath)).toBe(true);
    const customConfig = parseChangeConfig(fs.readFileSync(customConfigPath, 'utf8'));
    expect(customConfig.schema).toBe('my-custom-schema');
    expect(customConfig.proposeEngine).toBe('gemini');
  });

  it('should not execute shell metacharacters in a change description (S5, real binaries)', async () => {
    const gitDir = path.join(tempDir, 'git-repo-pwn');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });

    const { initializeOpenSpec, createNewChange } = await import('../src/services/repoService.js');
    await initializeOpenSpec(gitDir);

    const pwnFile = path.join(tempDir, 's5-pwn-real');
    const pwnFile2 = path.join(tempDir, 's5-pwn-real-2');
    const description = `desc $(touch ${pwnFile}) \`touch ${pwnFile2}\` ; echo pwned`;

    await createNewChange(gitDir, 'pwn-change', 'spec-driven', description);

    // With no shell in the exec path, $(...) and backticks are inert literal text.
    expect(fs.existsSync(pwnFile)).toBe(false);
    expect(fs.existsSync(pwnFile2)).toBe(false);
    expect(fs.existsSync(path.join(gitDir, 'openspec', 'changes', 'pwn-change'))).toBe(true);
  });

  it('should parse and stringify .openspec.yaml correctly', async () => {
    // The naive parseYaml/stringifyYaml were replaced by the yaml package in
    // S14; parser-level behavior (incl. multiline round-trip and the
    // legacy-oracle equivalence sweep) is covered in yamlConfig.test.ts.
    const { parseChangeConfig, stringifyChangeConfig } = await import('../src/utils/yamlConfig.js');

    const rawYaml = `
      # This is a comment
      schema: "spec-driven"
      created: 2026-06-17
      description: "My simple description"
      proposeEngine: "claude"
    `;

    const parsed = parseChangeConfig(rawYaml);
    expect(parsed).toEqual({
      schema: 'spec-driven',
      created: '2026-06-17',
      description: 'My simple description',
      proposeEngine: 'claude',
    });

    const written = stringifyChangeConfig({
      schema: 'my-custom',
      proposeEngine: 'cursor',
      nonExistent: undefined,
    });

    const reparsed = parseChangeConfig(written);
    expect(reparsed).toEqual({ schema: 'my-custom', proposeEngine: 'cursor' });
  });
});

