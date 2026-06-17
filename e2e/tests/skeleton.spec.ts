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

  test.beforeEach(async ({ page }) => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-dashboard-e2e-'));
    page.on('console', msg => console.log(`[PAGE LOG] ${msg.text()}`));
    page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));
    
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
    expect(fs.existsSync(path.join(gitDir, '.agent'))).toBe(true);
    expect(fs.existsSync(path.join(gitDir, '.claude'))).toBe(true);
    expect(fs.existsSync(path.join(gitDir, '.codex'))).toBe(true);
    expect(fs.existsSync(path.join(gitDir, '.cursor'))).toBe(true);
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

  test('should create a standard change proposal via UI', async ({ page }) => {
    // 1. Create a git repo and initialize openspec
    const gitDir = path.join(tempDir, 'git-repo-e2e-std-change');
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

    // 3. Verify Change Management section is visible, and click Create New Change button
    await expect(page.locator('.change-section h3')).toHaveText('Change Management');
    await page.locator('#show-create-change-btn').click();

    // 4. Fill form details
    await page.locator('#change-name-input').fill('standard-feat');
    await page.locator('#change-desc-input').fill('standard change desc');
    
    // Select predefined schema (spec-driven)
    await page.locator('#schema-select').selectOption('spec-driven');

    // Click submit
    await page.locator('.create-change-form button[type="submit"]').click();

    // 5. Verify success message
    await expect(page.locator('#change-create-success')).toContainText('Change "standard-feat" created successfully.');

    // 6. Verify filesystem changes
    const changeConfigFile = path.join(gitDir, 'openspec', 'changes', 'standard-feat', '.openspec.yaml');
    expect(fs.existsSync(changeConfigFile)).toBe(true);
    const content = fs.readFileSync(changeConfigFile, 'utf-8');
    expect(content).toContain('schema: "spec-driven"');
  });

  test('should create a custom change proposal via UI with custom states', async ({ page }) => {
    // 1. Create a git repo and initialize openspec
    const gitDir = path.join(tempDir, 'git-repo-e2e-cust-change');
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

    // 3. Verify Change Management section is visible, and click Create New Change button
    await expect(page.locator('.change-section h3')).toHaveText('Change Management');
    await page.locator('#show-create-change-btn').click();

    // 4. Fill form details
    await page.locator('#change-name-input').fill('custom-feat');
    await page.locator('label.radio-option:has-text("Custom States")').click();

    // Wait for the layout transition to complete
    await page.waitForTimeout(300);

    // Verify default checked states
    const specsCheckbox = page.locator('#check-specs');
    const designCheckbox = page.locator('#check-design');

    await expect(specsCheckbox).toBeChecked();
    await expect(designCheckbox).toBeChecked();

    // Toggle checkboxes by unchecking them directly
    await specsCheckbox.uncheck();
    await designCheckbox.uncheck();

    // Verify they are unchecked
    await expect(specsCheckbox).not.toBeChecked();
    await expect(designCheckbox).not.toBeChecked();





    // Click submit
    await page.locator('.create-change-form button[type="submit"]').click();

    // 5. Verify success message
    await expect(page.locator('#change-create-success')).toContainText('Change "custom-feat" created successfully.');

    // 6. Verify filesystem changes
    const schemaFile = path.join(gitDir, 'openspec', 'schemas', 'schema-proposal-tasks', 'schema.yaml');
    const schemasDir = path.join(gitDir, 'openspec', 'schemas');
    if (!fs.existsSync(schemaFile)) {
      console.log('Schemas directory exists:', fs.existsSync(schemasDir));
      if (fs.existsSync(schemasDir)) {
        console.log('Schemas directory contents:', fs.readdirSync(schemasDir));
      }
      const changesDir = path.join(gitDir, 'openspec', 'changes');
      console.log('Changes directory contents:', fs.readdirSync(changesDir));
    }
    expect(fs.existsSync(schemaFile)).toBe(true);

    const schemaContent = fs.readFileSync(schemaFile, 'utf-8');
    expect(schemaContent).toContain('proposal');
    expect(schemaContent).toContain('tasks');
    expect(schemaContent).not.toContain('specs');
    expect(schemaContent).not.toContain('design');

    const changeConfigFile = path.join(gitDir, 'openspec', 'changes', 'custom-feat', '.openspec.yaml');
    expect(fs.existsSync(changeConfigFile)).toBe(true);
    const content = fs.readFileSync(changeConfigFile, 'utf-8');
    expect(content).toContain('schema: "schema-proposal-tasks"');
  });

  test('should create a change with a selected propose engine and verify it in Review Mode', async ({ page }) => {
    // 1. Create a git repo and initialize openspec
    const gitDir = path.join(tempDir, 'git-repo-e2e-engine');
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

    // 3. Click Create New Change button
    await page.locator('#show-create-change-btn').click();

    // 4. Fill form details and select Claude Code as engine
    await page.locator('#change-name-input').fill('engine-feat');
    await page.locator('#change-desc-input').fill('my custom engine feature description');
    await page.locator('#propose-engine-select').selectOption('claude');

    // Click submit
    await page.locator('.create-change-form button[type="submit"]').click();

    // 5. Verify success message
    await expect(page.locator('#change-create-success')).toContainText('Change "engine-feat" created successfully.');

    // 6. Verify filesystem changes (.openspec.yaml should contain proposeEngine: "claude")
    const changeConfigFile = path.join(gitDir, 'openspec', 'changes', 'engine-feat', '.openspec.yaml');
    expect(fs.existsSync(changeConfigFile)).toBe(true);
    const content = fs.readFileSync(changeConfigFile, 'utf-8');
    expect(content).toContain('proposeEngine: "claude"');

    // 7. Click Review Mode Tab
    await page.locator('#review-mode-tab').click();

    // 8. Verify Metadata Card is visible with correct details
    const metadataCard = page.locator('#change-metadata-card');
    await expect(metadataCard).toBeVisible();
    await expect(metadataCard.locator('h3')).toContainText('Change Details: engine-feat');
    await expect(metadataCard.locator('.metadata-description')).toContainText('my custom engine feature description');

    // 9. Verify correct Claude Code instructions are rendered
    const instructionsPanel = page.locator('#engine-instructions-panel');
    await expect(instructionsPanel).toBeVisible();
    await expect(instructionsPanel.locator('.instruction-header')).toContainText('Claude Code Active');
    await expect(instructionsPanel.locator('.instruction-code')).toContainText('/opsx:propose engine-feat');

    // 10. Switch engine to Cursor in Review Mode
    await page.locator('#propose-engine-select-review').selectOption('cursor');

    // 11. Verify instructions panel updates to Cursor instructions
    await expect(instructionsPanel.locator('.instruction-header')).toContainText('Cursor Active');
    await expect(instructionsPanel.locator('.instruction-code')).toContainText('/opsx-propose engine-feat');

    // 12. Verify filesystem was updated to cursor
    await page.waitForTimeout(250);
    const updatedContent = fs.readFileSync(changeConfigFile, 'utf-8');
    expect(updatedContent).toContain('proposeEngine: "cursor"');
  });

  test('should load and display DAG linkage in Review Mode, and capture a screenshot', async ({ page }) => {
    // 1. Create a git repo with a complete OpenSpec change structure
    const gitDir = path.join(tempDir, 'git-repo-e2e-dag');
    const changeDir = path.join(gitDir, 'openspec', 'changes', 'e2e-change');
    fs.mkdirSync(changeDir, { recursive: true });

    // Initialize git
    execSync('git init -b main', { cwd: gitDir });

    // Write proposal
    fs.writeFileSync(
      path.join(changeDir, 'proposal.md'),
      `## Capabilities\n### New Capabilities\n- \`widget-feature\`: Add widget logic\n`
    );

    // Write spec
    const specDir = path.join(changeDir, 'specs', 'widget-feature');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'spec.md'),
      `## ADDED Requirements\n### Requirement: Verify Widget Display\nThe system SHALL show widget data.\n\n#### Scenario: Display successful\n- **WHEN** user loads widget\n- **THEN** data displays\n`
    );

    // Write design
    fs.writeFileSync(
      path.join(changeDir, 'design.md'),
      `## Decisions\n### Decision 1: Widget Database Integration\nStore widget data in sqlite database.\n`
    );

    // Write tasks
    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      `## 1. Widget Setup\n- [ ] 1.1 Create database schema for widget data\n- [x] 1.2 Implement widget service\n`
    );

    // Write linkages.json
    fs.writeFileSync(
      path.join(changeDir, 'linkages.json'),
      JSON.stringify([
        {
          source: 'Verify Widget Display',
          target: 'Decision 1: Widget Database Integration'
        },
        {
          source: 'Decision 1: Widget Database Integration',
          target: '1.1 Create database schema for widget data'
        },
        {
          source: 'Decision 1: Widget Database Integration',
          target: '1.2 Implement widget service'
        }
      ])
    );

    // 2. Open dashboard and verify path
    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    // 3. Click Review Mode Tab
    await page.locator('#review-mode-tab').click();

    // 4. Verify DAG elements are loaded
    await expect(page.locator('.dag-column h4').first()).toHaveText('Proposal');
    await expect(page.locator('.node-label').first()).toContainText('widget-feature');
    await expect(page.locator('.node-label').nth(1)).toContainText('Verify Widget Display');

    // 5. Take screenshot of the visual DAG dashboard
    const screenshotPath = path.join(path.resolve('.'), 'test-results', 'dashboard-screenshot.png');
    
    // Make sure test-results directory exists
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    // Verify screenshot file created
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});

