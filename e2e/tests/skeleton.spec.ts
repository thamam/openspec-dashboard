import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

test.describe('Walking Skeleton - E2E Path Verification', () => {
  test('should verify the local openspec-dashboard repository successfully', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('OpenSpec Dashboard');
    
    const currentRepoPath = path.resolve('.');
    await page.locator('#repo-path-input').fill(currentRepoPath);
    await page.locator('#verify-btn').click();
    
    await expect(page.locator('.badge-success')).toHaveText('Active');
    await expect(page.locator('.status-indicator.text-success').first()).toContainText('Git: Initialized');
    await expect(page.locator('.status-indicator.text-success').last()).toContainText('OpenSpec: Initialized');
  });

  test('should display directory does not exist for invalid paths', async ({ page }) => {
    await page.goto('/');
    const invalidPath = path.join(path.resolve('.'), 'non-existent-subfolder-xyz');
    await page.locator('#repo-path-input').fill(invalidPath);
    await page.locator('#verify-btn').click();
    
    await expect(page.locator('.badge-danger')).toHaveText('Not Found');
    await expect(page.locator('.error-message')).toContainText('was not found on the local filesystem');
  });
});

test.describe('Workspace Management - E2E Actions', () => {
  let tempDir: string;

  test.beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-dashboard-e2e-'));
  });

  test.afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('should initialize OpenSpec in a git repository via UI', async ({ page }) => {
    // 1. Create a git repo
    const gitDir = path.join(tempDir, 'git-repo-e2e-init');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });

    // 2. Open dashboard and verify path
    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    // 3. Verify status shows Git Initialized, OpenSpec Not Initialized, and Init button exists
    await expect(page.locator('.status-indicator.text-success')).toContainText('Git: Initialized');
    await expect(page.locator('.status-indicator.text-danger')).toContainText('OpenSpec: Not Initialized');
    
    const initBtn = page.locator('#init-openspec-btn');
    await expect(initBtn).toHaveText('Initialize OpenSpec');

    // 4. Click Initialize OpenSpec
    await initBtn.click();

    // 5. Verify status updates to OpenSpec: Initialized
    await expect(page.locator('.status-indicator.text-success').last()).toContainText('OpenSpec: Initialized');
    expect(fs.existsSync(path.join(gitDir, 'openspec'))).toBe(true);
  });

  test('should create git worktree in an initialized repository via UI', async ({ page }) => {
    // 1. Create a git repo and make an initial commit + init openspec
    const gitDir = path.join(tempDir, 'git-repo-e2e-worktree');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });
    execSync('openspec init --tools none', { cwd: gitDir });

    // 2. Open dashboard and verify path
    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    // 3. Verify worktree form is visible
    await expect(page.locator('h3').last()).toHaveText('Git Worktree Management');
    
    const branchInput = page.locator('#branch-name-input');
    const pathInput = page.locator('#worktree-path-input');
    const createBtn = page.locator('#create-worktree-btn');

    // Verify destination path auto-populated
    const autoPath = await pathInput.inputValue();
    expect(autoPath).toContain('git-repo-e2e-worktree-worktrees');

    // 4. Input branch name and submit
    await branchInput.fill('feature/logic');
    await createBtn.click();

    // 5. Verify success message
    await expect(page.locator('.message-success')).toContainText('Git worktree created successfully');

    // 6. Verify worktree directory is created on filesystem
    const worktreePath = autoPath.replace('new-branch', 'feature-logic');
    expect(fs.existsSync(worktreePath)).toBe(true);
    expect(fs.existsSync(path.join(worktreePath, '.git'))).toBe(true);
  });
});
