import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('V1 Workspace - Deterministic E2E Verification', () => {
  // Hermetic fixture: a throwaway git repo in the OS temp dir (same pattern as
  // agent-harness.spec.ts). This spec must NEVER seed or mutate the dashboard
  // repo's own committed openspec/changes/ directory.
  let tempDir: string;
  let repoPath: string;

  test.beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-dashboard-v1-e2e-'));
    repoPath = path.join(tempDir, 'toy-project');
    fs.mkdirSync(repoPath);

    // Mock an OpenSpec workspace
    const changesDir = path.join(repoPath, 'openspec', 'changes', 'auth-refactor');
    fs.mkdirSync(changesDir, { recursive: true });

    fs.writeFileSync(path.join(changesDir, 'proposal.md'), '# Proposal\nMock proposal content.');
    fs.writeFileSync(path.join(changesDir, 'spec.md'), '# Specs\nMock specs.');
    fs.writeFileSync(path.join(changesDir, 'design.md'), '# Design\nMock design.');
    fs.writeFileSync(path.join(changesDir, '.openspec.yaml'), 'schema: spec-driven');

    // The server validates repo-bearing endpoints (set_repo_path, /api/execute)
    // via checkRepoStatus and rejects non-git directories, so the fixture must
    // be a real git repo.
    execFileSync('git', ['init'], { cwd: repoPath, stdio: 'ignore' });
    
    // GFM Task format
    fs.writeFileSync(path.join(changesDir, 'tasks.md'), `
# Implementation Tasks
- [x] Task 1: Setup DB @Tomer
- [/] Task 2: Build API
- [ ] Task 3: Write tests
    `);
  });

  test.afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    // Navigate with the path query parameter to load the toy project
    await page.goto(`/?path=${encodeURIComponent(repoPath)}`);
    
    // Disable all CSS transitions/animations globally to prevent E2E layout shift failures
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.innerHTML = `
        *, *::before, *::after {
          transition: none !important;
          animation: none !important;
        }
      `;
      const observer = new MutationObserver(() => {
        const target = document.head || document.documentElement;
        if (target) {
          target.appendChild(style);
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });
  });

  test('P0: Load Artifacts - Artifact Viewer correctly displays tasks.md', async ({ page }) => {
    // Wait for the workspace to load
    await expect(page.locator('#workspace-header')).toContainText('Workspace:');

    // Click the auth-refactor change
    await page.locator('#nav-item-auth-refactor').click();

    // The artifact tabs (proposal/spec/design/tasks) live in the Raw Diffs (L4)
    // view; the viewer defaults to Skyline (L1).
    await page.getByRole('button', { name: '📝 Raw Diffs (L4)', exact: true }).click();

    // Verify Tasks tab is active (RawView activates the furthest populated tab,
    // and this fixture populates all four)
    await expect(page.locator('#tab-tasks')).toHaveClass(/active/);

    // The raw markdown should be in the artifact content
    const artifactContent = page.locator('#artifact-content');
    await expect(artifactContent).toContainText('Task 1: Setup DB');
    await expect(artifactContent).toContainText('Task 2: Build API');
  });

  test('P0: Task Parsing - Task Hub displays deterministically parsed tasks', async ({ page }) => {
    await page.locator('#nav-item-auth-refactor').click();

    // Wait for tasks to be populated
    await expect(page.locator('#task-count')).toContainText('3 Total');

    // Verify task 1 is done
    const task1 = page.locator('.task-list .task-card').nth(0);
    await expect(task1.locator('.task-title')).toContainText('Task 1: Setup DB');
    await expect(task1.locator('.task-assignee')).toContainText('@Tomer (done)');

    // Verify task 2 is wip
    const task2 = page.locator('.task-list .task-card').nth(1);
    await expect(task2.locator('.task-title')).toContainText('Task 2: Build API');
    await expect(task2.locator('.task-header')).toContainText('wip');
    
    // Verify task 3 is todo
    const task3 = page.locator('.task-list .task-card').nth(2);
    await expect(task3.locator('.task-title')).toContainText('Task 3: Write tests');
    await expect(task3.locator('.task-header')).toContainText('todo');
  });

  test('P0: Command Center - Executing lifecycle command issues the execute API call', async ({ page }) => {
    await page.locator('#nav-item-auth-refactor').click();

    // TerminalPane is now a live PTY over a socket and no longer renders the
    // ops log ($ command echo / streamed output), so the honest hermetic
    // assertion is the request the lifecycle button issues. Intercept it so the
    // e2e run never spawns a real agent/tmux session on the host.
    let executeBody: any = null;
    await page.route('**/api/execute', async (route) => {
      executeBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: '[Mock Lifecycle] ok\n[Process exited with code 0]',
      });
    });

    // Click Continue
    await page.locator('#btn-opsx-continue').click();

    // Verify the command reached the execute API with the fixture workspace
    await expect.poll(() => executeBody, { timeout: 5000 }).not.toBeNull();
    expect(executeBody.command).toBe('opsx-continue');
    expect(executeBody.repoPath).toBe(repoPath);
  });

  test('P0: Model Selection - Selector updates active provider config', async ({ page }) => {
    await page.locator('#nav-item-auth-refactor').click();

    // Verify select element exists
    const select = page.locator('#select-agent-provider');
    await expect(select).toBeVisible();

    // The default mocked change doesn't have agentProvider, so it defaults to "antigravity"
    await expect(select).toHaveValue('antigravity');

    // Change to claude
    await select.selectOption('claude');

    // Check if .openspec.yaml has been updated to agentProvider: "claude"
    const configPath = path.join(repoPath, 'openspec', 'changes', 'auth-refactor', '.openspec.yaml');
    await expect.poll(async () => {
      if (!fs.existsSync(configPath)) return false;
      const content = fs.readFileSync(configPath, 'utf8');
      return content.includes('agentProvider: "claude"');
    }, { timeout: 5000 }).toBe(true);
  });
});
