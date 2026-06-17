import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { checkRepoStatus } from '../src/services/repoService.js';

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
    });
  });
});

describe('repoService - initializeOpenSpec & createGitWorktree', () => {
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
  });

  it('should create a git worktree successfully', async () => {
    const gitDir = path.join(tempDir, 'git-repo-worktree');
    fs.mkdirSync(gitDir);
    
    // Initialize git repo and make an initial commit
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });

    const worktreeDest = path.join(tempDir, 'worktree-dest');

    const { createGitWorktree } = await import('../src/services/repoService.js');
    await createGitWorktree(gitDir, 'feature/my-worktree', worktreeDest);

    // Verify directory exists and has a .git file (worktree pointer)
    expect(fs.existsSync(worktreeDest)).toBe(true);
    expect(fs.existsSync(path.join(worktreeDest, '.git'))).toBe(true);
    
    // Verify branch exists in the original repo
    const branches = execSync('git branch', { cwd: gitDir }).toString();
    expect(branches).toContain('feature/my-worktree');
  });

  it('should throw validation error when branch name is invalid', async () => {
    const gitDir = path.join(tempDir, 'git-repo-worktree');
    const { createGitWorktree } = await import('../src/services/repoService.js');

    await expect(createGitWorktree(gitDir, 'invalid branch; rm -rf /', '/some/path')).rejects.toThrow(
      'Invalid branch name format'
    );
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

    const { initializeOpenSpec, createLocalSchema, createNewChange } = await import('../src/services/repoService.js');
    await initializeOpenSpec(gitDir);

    // Create change with predefined schema
    await createNewChange(gitDir, 'standard-change', 'spec-driven', 'my standard change description');
    
    const standardConfigPath = path.join(gitDir, 'openspec', 'changes', 'standard-change', '.openspec.yaml');
    expect(fs.existsSync(standardConfigPath)).toBe(true);
    const standardConfig = fs.readFileSync(standardConfigPath, 'utf8');
    expect(standardConfig).toContain('schema: spec-driven');

    // Create custom schema first, then create change with it
    await createLocalSchema(gitDir, 'my-custom-schema', ['proposal', 'tasks']);
    await createNewChange(gitDir, 'custom-change', 'my-custom-schema');
    
    const customConfigPath = path.join(gitDir, 'openspec', 'changes', 'custom-change', '.openspec.yaml');
    expect(fs.existsSync(customConfigPath)).toBe(true);
    const customConfig = fs.readFileSync(customConfigPath, 'utf8');
    expect(customConfig).toContain('schema: my-custom-schema');
  });
});

