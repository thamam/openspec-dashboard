import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

test.describe('Agent Harness E2E', () => {
  // Hermetic fixture: a throwaway git repo in the OS temp dir (same pattern as
  // v1_workspace.spec.ts). This spec must NEVER seed or mutate the dashboard
  // repo's own committed openspec/changes/ directory.
  let tempDir: string;
  let repoPath: string;

  test.beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-dashboard-harness-e2e-'));
    repoPath = path.join(tempDir, 'toy-project');
    fs.mkdirSync(path.join(repoPath, 'openspec', 'changes'), { recursive: true });
    // The server validates set_repo_path via checkRepoStatus and rejects
    // non-git directories, so the fixture must be a real git repo.
    execFileSync('git', ['init'], { cwd: repoPath, stdio: 'ignore' });
  });

  test.afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/?path=${encodeURIComponent(repoPath)}`);
  });

  test('UI Layout and State', async ({ page }) => {
    const harness = page.locator('.agent-harness');
    await expect(harness).toBeVisible();

    await expect(page.locator('.agent-harness-content')).toBeVisible();

    // Click header to collapse
    await page.locator('.collapse-btn').click();
    await expect(page.locator('.agent-harness-content')).toBeHidden();

    // Click to expand again
    await page.locator('.agent-harness-collapsed').click();
    await expect(page.locator('.agent-harness-content')).toBeVisible();
  });

  test('File Watcher & Live Analysis Streaming & Auto-Fix', async ({ page }) => {
    await page.getByRole('button', { name: 'Live Analysis' }).click();

    // Extract the actual repo path that the UI is using — the server anchors
    // to the git root, which may differ from the fixture path by symlink
    // resolution (e.g. /var vs /private/var on macOS).
    await expect(page.locator('.analysis-status')).toContainText('Watching', { timeout: 10000 });
    const statusText = await page.locator('.analysis-status').innerText();
    const match = statusText.match(/Watching (.*?) for OpenSpec changes/);
    expect(match, `analysis-status should report the watched repo (got: ${JSON.stringify(statusText)})`).not.toBeNull();
    const watchedRepoPath = match![1];
    expect(watchedRepoPath).toContain('toy-project');

    const actualDummyFilePath = path.join(watchedRepoPath, 'openspec', 'changes', 'dummy-test-file.md');

    // Trigger file change
    fs.writeFileSync(actualDummyFilePath, '# Dummy File\nTesting the watcher.');

    // Wait for the analysis output to stream
    await expect(page.locator('.events-list')).toContainText('dummy-test-file.md', { timeout: 10000 });
    await expect(page.locator('.mock-agent-thought')).toContainText('> Mocking analysis stream for testing...');

    // Check for the warning badge
    await expect(page.locator('.mock-agent-thought')).toContainText('⚠️ WARNING: Test Mode Warning');

    // Click Auto-Fix
    const fixBtn = page.getByRole('button', { name: 'Auto-Fix Issue' });
    await expect(fixBtn).toBeVisible();
    await fixBtn.click();

    // Because the mock is fast and the file watcher re-triggers analysis on the saved file,
    // the UI might quickly flip back to analyzing. We just verify the file on disk.
    // Verify file content was rewritten by mock
    const content = fs.readFileSync(actualDummyFilePath, 'utf-8');
    expect(content).toContain('# Fixed in Test Mode');
  });

  test('Interactive Chat & Memory Persistence', async ({ page }) => {
    await page.getByRole('button', { name: 'Interactive Chat' }).click();

    const input = page.getByPlaceholder('Ask the agent to modify the dashboard...');
    await input.fill('Hello Agent');
    await input.press('Enter');

    await expect(page.locator('.chat-history')).toContainText('Hello Agent');

    await expect(page.locator('.chat-history')).toContainText('Mocked reply to: "Hello Agent"', { timeout: 10000 });

    // The mock reply renders in the UI as soon as the chunk streams, but the
    // server only persists it to chat_history.json when the chat promise
    // resolves (500ms later in TEST_MODE). Reloading before the save would
    // restore a history without the reply — wait for the write first.
    // realpathSync: the server anchors to the git root (e.g. /private/var on macOS).
    const historyPath = path.join(fs.realpathSync(repoPath), '.agent', 'chat_history.json');
    await expect.poll(() => {
      if (!fs.existsSync(historyPath)) return '';
      return fs.readFileSync(historyPath, 'utf8');
    }, { timeout: 10000 }).toContain('Mocked reply to: \\"Hello Agent\\"');

    // Reload the page to test persistence
    await page.reload();

    // Wait for the websocket to reconnect and set repo path
    await expect(page.locator('.analysis-status')).toContainText('Watching', { timeout: 10000 });

    await page.getByRole('button', { name: 'Interactive Chat' }).click();

    // Verify history is still there
    await expect(page.locator('.chat-history')).toContainText('Hello Agent');
    await expect(page.locator('.chat-history')).toContainText('Mocked reply to: "Hello Agent"');
  });
});
