import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('V1 Workspace - Deterministic E2E Verification', () => {
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

    // Verify Tasks tab is active
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

  test('P0: Command Center - Executing lifecycle command streams to terminal', async ({ page }) => {
    await page.locator('#nav-item-auth-refactor').click();

    // Click Continue
    await page.locator('#btn-opsx-continue').click();

    // Verify Terminal gets the command
    const terminal = page.locator('#terminal-pane');
    await expect(terminal).toContainText('$ opsx-continue');
  });
});
