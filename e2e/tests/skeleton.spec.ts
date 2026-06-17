import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Walking Skeleton - E2E Path Verification', () => {
  test('should verify the local openspec-dashboard repository successfully', async ({ page }) => {
    // 1. Open Dashboard
    await page.goto('/');
    
    // Check initial UI elements
    await expect(page.locator('h1')).toHaveText('OpenSpec Dashboard');
    
    // 2. Input current repository path
    const currentRepoPath = path.resolve('.');
    
    await page.locator('#repo-path-input').fill(currentRepoPath);
    
    // 3. Click Verify Path
    await page.locator('#verify-btn').click();
    
    // 4. Verify status is active and shows Git/OpenSpec Initialized
    await expect(page.locator('.badge-success')).toHaveText('Active');
    await expect(page.locator('.status-indicator.text-success').first()).toContainText('Git: Initialized');
    await expect(page.locator('.status-indicator.text-success').last()).toContainText('OpenSpec: Initialized');
  });

  test('should display directory does not exist for invalid paths', async ({ page }) => {
    await page.goto('/');
    
    const invalidPath = path.join(path.resolve('.'), 'non-existent-subfolder-xyz');
    
    await page.locator('#repo-path-input').fill(invalidPath);
    await page.locator('#verify-btn').click();
    
    // Verify error card displays
    await expect(page.locator('.badge-danger')).toHaveText('Not Found');
    await expect(page.locator('.error-message')).toContainText('was not found on the local filesystem');
  });
});
