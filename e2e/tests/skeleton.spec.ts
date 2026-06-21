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
    const gitDir = path.join(tempDir, 'git-repo-e2e-init');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    await expect(page.locator('.status-indicator.text-success')).toContainText('Git: Initialized');
    await expect(page.locator('.status-indicator.text-danger')).toContainText('OpenSpec: Not Initialized');
    
    await page.locator('.plumbing-trigger').click();
    const initBtn = page.locator('#init-openspec-btn');
    await expect(initBtn).toContainText('Initialize OpenSpec');

    await initBtn.click();

    await expect(page.locator('.status-indicator.text-success').last()).toContainText('OpenSpec: Initialized');
    expect(fs.existsSync(path.join(gitDir, 'openspec'))).toBe(true);
  });

  test('should create git worktree in an initialized repository via UI', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-worktree');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });
    execSync('openspec init --tools none', { cwd: gitDir });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    await page.locator('.plumbing-trigger').click();
    await page.locator('.plumbing-item:has-text("Create Worktree…")').click();

    await expect(page.locator('.modal-header h2')).toHaveText('Create Git Worktree');
    
    const branchInput = page.locator('#branch-name-input');
    const pathInput = page.locator('#worktree-path-input');
    const createBtn = page.locator('#create-worktree-btn');

    const autoPath = await pathInput.inputValue();
    expect(autoPath).toContain('git-repo-e2e-worktree-worktrees');

    await branchInput.fill('feature/logic');
    await createBtn.click();

    await expect(page.locator('.message-success')).toContainText('Git worktree created successfully');

    const worktreePath = autoPath.replace('new-branch', 'feature-logic');
    expect(fs.existsSync(worktreePath)).toBe(true);
  });

  test('should create a standard change proposal via UI', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-std-change');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });
    execSync('openspec init --tools none', { cwd: gitDir });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    await expect(page.locator('.sidebar-section-title')).toHaveText('Changes');
    await page.locator('#show-create-change-btn').click();

    await page.locator('#change-name-input').fill('standard-feat');
    await page.locator('#change-desc-input').fill('standard change desc');
    await page.locator('#schema-select').selectOption('spec-driven');

    await page.locator('.create-change-form button[type="submit"]').click();

    await expect(page.locator('#change-create-success')).toContainText('Change "standard-feat" created successfully.');

    const changeConfigFile = path.join(gitDir, 'openspec', 'changes', 'standard-feat', '.openspec.yaml');
    expect(fs.existsSync(changeConfigFile)).toBe(true);
  });

  test('should create a custom change proposal via UI with custom states', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-cust-change');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });
    execSync('openspec init --tools none', { cwd: gitDir });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    await expect(page.locator('.sidebar-section-title')).toHaveText('Changes');
    await page.locator('#show-create-change-btn').click();

    await page.locator('#change-name-input').fill('custom-feat');
    await page.locator('label.radio-option:has-text("Custom States")').click();

    await page.waitForTimeout(300);

    const specsCheckbox = page.locator('#check-specs');
    const designCheckbox = page.locator('#check-design');

    await expect(specsCheckbox).toBeChecked();
    await expect(designCheckbox).toBeChecked();

    await specsCheckbox.uncheck();
    await designCheckbox.uncheck();

    await expect(specsCheckbox).not.toBeChecked();
    await expect(designCheckbox).not.toBeChecked();

    await page.locator('.create-change-form button[type="submit"]').click();

    await expect(page.locator('#change-create-success')).toContainText('Change "custom-feat" created successfully.');

    const schemaFile = path.join(gitDir, 'openspec', 'schemas', 'schema-proposal-tasks', 'schema.yaml');
    expect(fs.existsSync(schemaFile)).toBe(true);
  });

  test('should create a change with a selected propose engine and verify it in Propose and Review', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-engine');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });
    execSync('openspec init --tools none', { cwd: gitDir });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    await page.locator('#show-create-change-btn').click();

    await page.locator('#change-name-input').fill('engine-feat');
    await page.locator('#change-desc-input').fill('my custom engine feature description');
    await page.locator('#new-change-engine-select').selectOption('claude');

    await page.locator('.create-change-form button[type="submit"]').click();

    await expect(page.locator('#change-create-success')).toContainText('Change "engine-feat" created successfully.');

    const changeConfigFile = path.join(gitDir, 'openspec', 'changes', 'engine-feat', '.openspec.yaml');
    expect(fs.existsSync(changeConfigFile)).toBe(true);

    const engineSelect = page.locator('.propose-canvas select#propose-engine-select');
    await expect(engineSelect).toHaveValue('claude');

    const commandBox = page.locator('.propose-canvas .command-code');
    await expect(commandBox).toContainText('openspec propose engine-feat --engine claude');

    await engineSelect.selectOption('cursor');
    await expect(commandBox).toContainText('openspec propose engine-feat --engine cursor');

    await page.waitForTimeout(250);
    const updatedContent = fs.readFileSync(changeConfigFile, 'utf-8');
    expect(updatedContent).toContain('proposeEngine: "cursor"');

    await page.locator('#review-mode-tab').click();
    await expect(page.locator('.header-title')).toHaveText('engine-feat');
  });

  test('should load and display DAG linkage, select nodes, check tasks, and filter nodes', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-dag');
    const changeDir = path.join(gitDir, 'openspec', 'changes', 'e2e-change');
    fs.mkdirSync(changeDir, { recursive: true });

    execSync('git init -b main', { cwd: gitDir });

    fs.writeFileSync(
      path.join(changeDir, 'proposal.md'),
      `## Capabilities\n### New Capabilities\n- \`widget-feature\`: Add widget logic\n- \`unrelated-feature\`: Unrelated capability\n`
    );

    const specDir = path.join(changeDir, 'specs', 'widget-feature');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'spec.md'),
      `## ADDED Requirements\n### Requirement: Verify Widget Display\nThe system SHALL show widget data.\n\n#### Scenario: Display successful\n- **WHEN** user loads widget\n- **THEN** data displays\n`
    );

    const unrelatedSpecDir = path.join(changeDir, 'specs', 'unrelated-feature');
    fs.mkdirSync(unrelatedSpecDir, { recursive: true });
    fs.writeFileSync(
      path.join(unrelatedSpecDir, 'spec.md'),
      `## Requirements\n### Requirement: Unrelated Requirement\nThis is unrelated.\n`
    );

    fs.writeFileSync(
      path.join(changeDir, 'design.md'),
      `## Decisions\n### Decision 1: Widget Database Integration\nStore widget data in sqlite database.\n`
    );

    fs.writeFileSync(
      path.join(changeDir, 'tasks.md'),
      `## 1. Widget Setup\n- [ ] 1.1 Create database schema for widget data\n- [x] 1.2 Implement widget service\n`
    );

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

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    await page.locator('#review-mode-tab').click();

    // 1. Verify DAG elements are loaded
    await expect(page.locator('.dag-column h4').first()).toHaveText('Proposal');
    await expect(page.locator('.node-label').first()).toContainText('widget-feature');

    // 2. Select a node and verify highlighting
    const nodeEl = page.locator('.dag-node:has-text("Verify Widget Display")');
    await nodeEl.click();
    await expect(nodeEl).toHaveClass(/selected/);
    
    // Unrelated node should fade
    const unrelatedNode = page.locator('.dag-node:has-text("unrelated-feature")');
    await expect(unrelatedNode).toHaveClass(/faded/);

    // Deselect node
    await nodeEl.click();
    await expect(nodeEl).not.toHaveClass(/selected/);
    await expect(unrelatedNode).not.toHaveClass(/faded/);

    // 3. Check node filtering
    const filterInput = page.locator('.views-filter-input');
    await filterInput.fill('widget-feature');
    await expect(nodeEl).toHaveClass(/filtered-out/);
    await expect(unrelatedNode).toHaveClass(/filtered-out/);

    await filterInput.fill(''); // clear filter

    // 4. View toggles (DAG edge line checks)
    const dagToggle = page.locator('.views-chip:has-text("DAG")');
    await expect(dagToggle).toHaveClass(/active/);
    await dagToggle.click();
    await expect(dagToggle).not.toHaveClass(/active/);
    await dagToggle.click();

    // 5. Critical paths toggle
    const critToggle = page.locator('.views-chip:has-text("Critical Paths")');
    await critToggle.click();
    await expect(critToggle).toHaveClass(/active/);
    
    // Critical task node gets critical border
    const pendingTaskNode = page.locator('.dag-node:has-text("1.1 Create database schema")');
    await expect(pendingTaskNode).toHaveClass(/critical/);

    // 6. Check task completion status checkbox
    const taskCheckbox = page.locator('input[id*="task-check-"]').first();
    await expect(taskCheckbox).not.toBeChecked();
    await taskCheckbox.check();
    await expect(taskCheckbox).toBeChecked();

    // Verify task completion progress updates
    await expect(page.locator('.meta-info-chip:has-text("tasks complete")')).toContainText('2 / 2 tasks complete');
  });

  test('should interact with the Review Mode Chat interface and switch providers', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-chat');
    const changeDir = path.join(gitDir, 'openspec', 'changes', 'e2e-chat-change');
    fs.mkdirSync(changeDir, { recursive: true });

    execSync('git init -b main', { cwd: gitDir });

    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Capabilities\n- widget-feature\n');

    await page.route('**/api/changes/*/chat', async route => {
      const postData = route.request().postDataJSON();
      const lastMessage = postData.messages[postData.messages.length - 1];
      let replyMessage = 'Auditor analysis complete.';
      if (lastMessage && lastMessage.content === 'Audit Traceability') {
        replyMessage = 'Traceability check passed: No orphans found.';
      } else if (lastMessage && lastMessage.content === 'hello') {
        replyMessage = `Hello! You selected provider: ${postData.provider} and model: ${postData.model}`;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: replyMessage }),
      });
    });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    await page.locator('#review-mode-tab').click();

    await page.locator('#ask-ai-btn').click();

    const toolDock = page.locator('.tool-dock');
    await expect(toolDock).toBeVisible();
    await expect(toolDock.locator('.tool-dock-title')).toContainText('Ask AI');

    const settingsToggleBtn = toolDock.locator('.settings-toggle-btn');
    await expect(settingsToggleBtn).toHaveText('⚙️ Configure AI Options');
    await settingsToggleBtn.click();
    await expect(settingsToggleBtn).toHaveText('⚙️ Hide AI Options');

    const providerSelect = toolDock.locator('#chat-provider-select');
    const modelSelect = toolDock.locator('#chat-model-select');
    const modelInput = toolDock.locator('#chat-model-input');
    await expect(providerSelect).toBeVisible();
    await expect(modelSelect).toBeVisible();
    await expect(providerSelect).toHaveValue('gemini');
    await expect(modelSelect).toHaveValue('gemini-3.5-flash');

    await providerSelect.selectOption('ollama');
    await expect(modelSelect).toBeVisible();
    await expect(modelSelect).toHaveValue('qwen3-coder-next');

    // Select custom model in Ollama and fill in a value
    await modelSelect.selectOption('custom');
    await expect(modelInput).toBeVisible();
    await modelInput.fill('gemma2');

    await providerSelect.selectOption('custom');
    await expect(modelInput).toBeVisible();
    await expect(modelInput).toHaveValue('gpt-4o');
    const endpointInput = toolDock.locator('#chat-endpoint-input');
    const keyInput = toolDock.locator('#chat-key-input');
    await expect(endpointInput).toBeVisible();
    await expect(keyInput).toBeVisible();

    await endpointInput.fill('https://custom-ai.com/v1');
    await keyInput.fill('my-secret-key');

    await settingsToggleBtn.click();
    await expect(providerSelect).not.toBeVisible();

    const auditBtn = toolDock.locator('button:has-text("Audit Traceability")');
    await auditBtn.click();
    
    await toolDock.locator('button[type="submit"]').click();

    const firstUserBubble = toolDock.locator('.chat-bubble.user').first();
    const firstAssistantBubble = toolDock.locator('.chat-bubble.assistant').nth(1);
    await expect(firstUserBubble).toContainText('Audit Traceability');
    await expect(firstAssistantBubble).toContainText('Traceability check passed: No orphans found.');

    const chatInput = toolDock.locator('input[placeholder="Ask about this stage..."]');
    const sendBtn = toolDock.locator('button[type="submit"]');

    await settingsToggleBtn.click();
    await providerSelect.selectOption('custom');

    await chatInput.fill('hello');
    await sendBtn.click();

    const secondUserBubble = toolDock.locator('.chat-bubble.user').nth(1);
    const secondAssistantBubble = toolDock.locator('.chat-bubble.assistant').nth(2);
    await expect(secondUserBubble).toContainText('hello');
    await expect(secondAssistantBubble).toContainText('Hello! You selected provider: custom and model: gpt-4o');
  });

  test('should run a complete brainstorming session via UI and commit the change', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-brainstorm');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });
    execSync('openspec init --tools none', { cwd: gitDir });

    await page.route('**/api/brainstorm/start', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: `[DECISIONS]\n- [OPEN] Database Storage\n[END_DECISIONS]\n\nQuestion 1: Where do you want to store points?\nRecommended: Use User table`
        }),
      });
    });

    await page.route('**/api/brainstorm/chat', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: `[DECISIONS]\n- [RESOLVED] Database Storage\n- [OPEN] Exchange rate\n[END_DECISIONS]\n\nQuestion 2: What is the exchange rate?\nRecommended: 100 points = $1`
        }),
      });
    });

    await page.route('**/api/brainstorm/commit', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Change "points-feature" initialized and files written successfully.'
        }),
      });
    });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    await expect(page.locator('.status-indicator.text-success').last()).toContainText('OpenSpec: Initialized');

    await page.locator('#show-brainstorm-btn').click();

    await page.locator('#temp-change-name').fill('points-feature');
    await page.locator('#raw-feature-idea').fill('Earn points on purchases');
    await page.locator('button:has-text("Start Brainstorming")').click();

    await expect(page.locator('.decision-item.open')).toContainText('Database Storage');
    await expect(page.locator('.chat-bubble-wrapper.assistant').first().locator('.chat-bubble-content')).toContainText('Where do you want to store points?');

    const acceptBtn = page.locator('button.accept-rec-btn');
    await expect(acceptBtn).toContainText('Use User table');
    await acceptBtn.click();

    await expect(page.locator('.decision-item.resolved')).toContainText('Database Storage');
    await expect(page.locator('.decision-item.open')).toContainText('Exchange rate');

    await page.locator('button.commit-btn').click();

    await expect(page.locator('#change-create-success')).toContainText('Change "points-feature" created successfully.');
  });

  test('should verify context-aware chatbot views and audit checks in Propose vs Review', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-context');
    const changeDir = path.join(gitDir, 'openspec', 'changes', 'context-change');
    fs.mkdirSync(changeDir, { recursive: true });

    execSync('git init -b main', { cwd: gitDir });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Capabilities\n- context-feature\n');

    await page.route(/api\/changes\/[^/]+\/audit/, async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ ok: true, text: 'Clean layout check' }]),
      });
    });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    // 1. Verify Audit view in Propose Stage shows empty state
    await page.locator('.tool-cluster button:has-text("Audit")').click();
    const toolDock = page.locator('.tool-dock');
    await expect(toolDock.locator('.audit-empty-card')).toBeVisible();
    await expect(toolDock.locator('.audit-empty-text')).toContainText('No DAG to audit yet');

    // 2. Open Ask AI in Propose Stage and verify greeting
    await page.locator('#ask-ai-btn').click();
    await expect(toolDock.locator('.chat-bubble.assistant')).toContainText('Ask me anything about shaping this change');

    // 3. Switch to Review Stage and verify context updates
    await page.locator('#review-mode-tab').click();
    await expect(toolDock.locator('.chat-bubble.assistant').first()).toContainText('Ask me anything about the generated DAG');

    // 4. Open Audit view in Review Stage and verify checklist renders
    await page.locator('.tool-cluster button:has-text("Audit")').click();
    await expect(toolDock.locator('.audit-check-item.ok')).toBeVisible();
    await expect(toolDock.locator('.audit-check-text')).toHaveText('Clean layout check');
  });

  test('should trigger Run Propose generator and switch repository or active changes', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-permute');
    const changeDir = path.join(gitDir, 'openspec', 'changes', 'perm-change');
    fs.mkdirSync(changeDir, { recursive: true });

    execSync('git init -b main', { cwd: gitDir });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '## Capabilities\n- perm-feature\n');

    // Mock propose route
    await page.route('**/api/changes/*/propose', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Proposal generated successfully!' }),
      });
    });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    // 1. Select the change in list
    await page.locator('.change-item-name:has-text("perm-change")').click();
    await expect(page.locator('.header-title')).toHaveText('perm-change');

    // 2. Click Run Propose and verify success banner
    const runBtn = page.locator('.propose-canvas button.run-propose-btn');
    await runBtn.click();
    await expect(page.locator('.propose-status-banner.success')).toContainText('Proposal generated successfully!');

    // 3. Click Switch Repository inside Left Sidebar
    await page.locator('.sidebar-repo-row button[title="Switch repository"]').click();
    
    // Expect returning to connection verify-gate
    await expect(page.locator('#repo-path-input')).toBeVisible();
  });

  test('should toggle dark mode and themes via the plumbing menu', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-themes');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });
    execSync('openspec init --tools none', { cwd: gitDir });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    const appShell = page.locator('.app-shell');
    await expect(appShell).toHaveClass(/theme-soft/);
    await expect(appShell).toHaveClass(/mode-light/);

    await page.locator('.plumbing-trigger').click();
    await page.locator('.plumbing-item:has-text("Light mode")').click();

    await expect(appShell).toHaveClass(/mode-dark/);

    await page.locator('.segment-btn:has-text("Mono")').click();
    await expect(appShell).toHaveClass(/theme-mono/);

    await page.locator('.segment-btn:has-text("Vivid")').click();
    await expect(appShell).toHaveClass(/theme-vivid/);

    await page.locator('#review-mode-tab').click();
    await expect(page.locator('.review-canvas')).toBeVisible();
    await expect(appShell).toHaveClass(/mode-dark/);
  });

  test('should support manual change of the width of the panes via drag resizing', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-resizing');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });
    execSync('openspec init --tools none', { cwd: gitDir });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    // Verify sidebar starts at 240px
    const sidebar = page.locator('.sidebar');
    await expect(sidebar).toHaveCSS('width', '240px');

    // Drag the sidebar resizer to the right by 60px
    const sidebarResizer = page.locator('.sidebar-resizer');
    const box = await sidebarResizer.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2);
      await page.mouse.up();
    }

    // Verify sidebar is now 300px
    await expect(sidebar).toHaveCSS('width', '300px');

    // Try to drag sidebar past min bounds (drag left to less than 180px, e.g. -200px)
    const newBox = await sidebarResizer.boundingBox();
    if (newBox) {
      await page.mouse.move(newBox.x + newBox.width / 2, newBox.y + newBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(newBox.x + newBox.width / 2 - 200, newBox.y + newBox.height / 2);
      await page.mouse.up();
    }
    // Should still be 300px because bounds check fails
    await expect(sidebar).toHaveCSS('width', '300px');

    // Open tool dock
    await page.locator('.tool-cluster-btn:has-text("Grill Me")').click();
    const toolDock = page.locator('.tool-dock');
    await expect(toolDock).toBeVisible();
    await expect(toolDock).toHaveCSS('width', '388px');

    // Drag the tool dock resizer left by 100px (increasing its width from 388 to 488px)
    const dockResizer = page.locator('.tool-dock-resizer');
    const dockBox = await dockResizer.boundingBox();
    if (dockBox) {
      await page.mouse.move(dockBox.x + dockBox.width / 2, dockBox.y + dockBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(dockBox.x + dockBox.width / 2 - 100, dockBox.y + dockBox.height / 2);
      await page.mouse.up();
    }
    await expect(toolDock).toHaveCSS('width', '488px');

    // Try to drag past bounds (e.g. right by 500px, which violates min dock width 280px)
    const newDockBox = await dockResizer.boundingBox();
    if (newDockBox) {
      await page.mouse.move(newDockBox.x + newDockBox.width / 2, newDockBox.y + newDockBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(newDockBox.x + newDockBox.width / 2 + 500, newDockBox.y + newDockBox.height / 2);
      await page.mouse.up();
    }
    await expect(toolDock).toHaveCSS('width', '488px');
  });

  test('should resolve repository path to git root when given a subdirectory', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-subdir');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });
    execSync('openspec init --tools none', { cwd: gitDir });

    const subDir = path.join(gitDir, 'openspec', 'changes');
    fs.mkdirSync(subDir, { recursive: true });

    await page.goto('/');
    await page.locator('#repo-path-input').fill(subDir);
    await page.locator('#verify-btn').click();

    // Verify path in sidebar is updated to the gitDir root
    await expect(page.locator('.sidebar-repo-path')).toHaveText(gitDir);

    // Verify status displays active
    await expect(page.locator('.badge-success')).toHaveText('Active');
  });

  test('should fallback to proposal-doc when proposal.md contains no explicit capabilities', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-fallback-doc');
    const changeDir = path.join(gitDir, 'openspec', 'changes', 'fallback-change');
    fs.mkdirSync(changeDir, { recursive: true });
    execSync('git init -b main', { cwd: gitDir });

    // Write proposal.md without capabilities
    fs.writeFileSync(
      path.join(changeDir, 'proposal.md'),
      `## Why\nOnly description here, no capabilities section.\n`
    );

    // Write spec requirement
    const specDir = path.join(changeDir, 'specs', 'some-feature');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(
      path.join(specDir, 'spec.md'),
      `## Requirements\n### Requirement: Some Requirement\nThis is a requirement.\n`
    );

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    // Select change
    await page.locator('.change-item:has-text("fallback-change")').click();

    // Go to Review Mode
    await page.locator('#review-mode-tab').click();

    // Verify proposal-doc is visible in Proposal column
    const proposalDocNode = page.locator('.dag-column:has-text("Proposal") .dag-node:has-text("proposal.md")');
    await expect(proposalDocNode).toBeVisible();

    // Verify Some Requirement is visible in Specs column
    const specNode = page.locator('.dag-column:has-text("Specs") .dag-node:has-text("Some Requirement")');
    await expect(specNode).toBeVisible();
  });

  test('should display red trace-readiness indicator and Update Init button when outdated, and update to green upon clicking Update Init', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-repo-e2e-trace-readiness');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });

    // OpenSpec is initialized but lacks the updated .agent files, so isTraceReady should be false
    fs.mkdirSync(path.join(gitDir, 'openspec'));

    await page.goto('/');
    await page.locator('#repo-path-input').fill(gitDir);
    await page.locator('#verify-btn').click();

    // Verify it is recognized as active
    await expect(page.locator('.badge-success')).toHaveText('Active');

    // Dot should be red (outdated)
    const dot = page.locator('.sidebar-repo-dot');
    await expect(dot).toBeVisible();
    await expect(dot).toHaveAttribute('title', 'Outdated traceability templates (Red)');
    await expect(dot).toHaveCSS('background-color', 'rgb(239, 68, 68)'); // --red: #ef4444

    // Update Init button should be visible next to it
    const updateBtn = page.locator('.update-init-btn');
    await expect(updateBtn).toBeVisible();
    await expect(updateBtn).toHaveText('Update Init');

    // Click Update Init
    await updateBtn.click();

    // The dot should turn green
    await expect(dot).toHaveAttribute('title', 'Traceability flow ready (Green)');
    await expect(dot).toHaveCSS('background-color', 'rgb(16, 185, 129)'); // --green: #10b981

    // Update Init button should be hidden
    await expect(updateBtn).not.toBeVisible();
  });

  test('should support worktree trace updates dialog with custom checkboxes selection', async ({ page }) => {
    const gitDir = path.join(tempDir, 'git-wt-update-src');
    fs.mkdirSync(gitDir);
    execSync('git init -b main', { cwd: gitDir });
    execSync('git config user.name "Test"', { cwd: gitDir });
    execSync('git config user.email "test@test.com"', { cwd: gitDir });
    fs.writeFileSync(path.join(gitDir, 'README.md'), '# Test');
    execSync('git add README.md && git commit -m "Initial commit"', { cwd: gitDir });

    // OpenSpec initialized but lacks traces in both main repo and worktree
    fs.mkdirSync(path.join(gitDir, 'openspec'));

    const wtDir = path.join(tempDir, 'git-wt-update-dest');
    execSync(`git worktree add -b "wt-branch" "${wtDir}"`, { cwd: gitDir });
    fs.mkdirSync(path.join(wtDir, 'openspec'));

    // Go to dashboard, connect to worktree directory
    await page.goto('/');
    await page.locator('#repo-path-input').fill(wtDir);
    await page.locator('#verify-btn').click();

    // Verify dot is red
    const dot = page.locator('.sidebar-repo-dot');
    await expect(dot).toBeVisible();
    await expect(dot).toHaveAttribute('title', 'Outdated traceability templates (Red)');

    // Click Update Init
    const updateBtn = page.locator('.update-init-btn');
    await updateBtn.click();

    // Verify modal is visible
    await expect(page.locator('.worktree-update-modal')).toBeVisible();

    // Click Custom Selection...
    await page.locator('#wt-update-custom-btn').click();

    // Verify wtDir checkbox is disabled (pre-selected/required), but main gitDir checkbox is enabled
    // We use a regular expression or simple text to match gitDir
    const gitDirCheckbox = page.locator(`.worktree-checkbox-item:has-text("${gitDir}") input[type="checkbox"]`);
    await expect(gitDirCheckbox).toBeVisible();
    await expect(gitDirCheckbox).not.toBeDisabled();
    await expect(gitDirCheckbox).not.toBeChecked();

    // Click to select gitDir as well
    await gitDirCheckbox.click();
    await expect(gitDirCheckbox).toBeChecked();

    // Click Update Selected
    await page.locator('#wt-update-submit-btn').click();

    // Verify modal closes
    await expect(page.locator('.worktree-update-modal')).not.toBeVisible();

    // Verify status dot updates to green
    await expect(dot).toHaveAttribute('title', 'Traceability flow ready (Green)');

    // Verify both wtDir and gitDir now have the trace files copied
    expect(fs.existsSync(path.join(wtDir, '.agent', 'workflows', 'opsx-propose.md'))).toBe(true);
    expect(fs.existsSync(path.join(gitDir, '.agent', 'workflows', 'opsx-propose.md'))).toBe(true);
  });
});
