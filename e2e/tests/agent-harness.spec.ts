import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Agent Harness E2E', () => {
  const dummyFilePath = path.resolve(__dirname, '../../openspec/changes/dummy-test-file.md');
  const dummyDir = path.dirname(dummyFilePath);

  test.beforeAll(() => {
    if (!fs.existsSync(dummyDir)) {
      fs.mkdirSync(dummyDir, { recursive: true });
    }
    if (fs.existsSync(dummyFilePath)) {
      fs.unlinkSync(dummyFilePath);
    }
  });

  test.afterAll(() => {
    if (fs.existsSync(dummyFilePath)) {
      fs.unlinkSync(dummyFilePath);
    }
  });

  test('UI Layout and State', async ({ page }) => {
    await page.goto('/');
    
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
    await page.goto('/');

    await page.getByRole('button', { name: 'Live Analysis' }).click();

    // Extract the actual repo path that the UI is using
    await expect(page.locator('.analysis-status')).toContainText('Watching', { timeout: 10000 });
    const statusText = await page.locator('.analysis-status').innerText();
    const match = statusText.match(/Watching (.*?) for OpenSpec changes/);
    const repoPath = match ? match[1] : '';
    
    const actualDummyFilePath = path.join(repoPath, 'openspec', 'changes', 'dummy-test-file.md');
    const dummyDir = path.dirname(actualDummyFilePath);
    if (!fs.existsSync(dummyDir)) fs.mkdirSync(dummyDir, { recursive: true });

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
    await page.goto('/');
    
    await page.getByRole('button', { name: 'Interactive Chat' }).click();

    const input = page.getByPlaceholder('Ask the agent to modify the dashboard...');
    await input.fill('Hello Agent');
    await input.press('Enter');

    await expect(page.locator('.chat-history')).toContainText('Hello Agent');

    await expect(page.locator('.chat-history')).toContainText('Mocked reply to: "Hello Agent"', { timeout: 10000 });

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
