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
