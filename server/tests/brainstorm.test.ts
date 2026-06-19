import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from '../src/app.js';
import { getMainSpecsContent, commitBrainstormChange } from '../src/services/brainstormService.js';

describe('Brainstorm Service', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-dashboard-brainstorm-test-'));
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return empty string if specs directory does not exist', () => {
    const content = getMainSpecsContent(tempDir);
    expect(content).toBe('');
  });

  it('should recursively read main spec files content', () => {
    const specsDir = path.join(tempDir, 'openspec', 'specs');
    fs.mkdirSync(specsDir, { recursive: true });

    fs.writeFileSync(path.join(specsDir, 'glossary.md'), '# Glossary\n- term: client\n');
    const billingDir = path.join(specsDir, 'billing');
    fs.mkdirSync(billingDir);
    fs.writeFileSync(path.join(billingDir, 'invoice.md'), '# Invoice\n- invoices exist\n');

    const content = getMainSpecsContent(tempDir);
    expect(content).toContain('=== SPEC FILE: glossary.md ===\n# Glossary');
    expect(content).toContain('=== SPEC FILE: billing/invoice.md ===\n# Invoice');
  });

  it('should initialize a change and overwrite its files with committed decisions', async () => {
    // Mock checkRepoStatus to look like a valid openspec repository
    const statusDir = path.join(tempDir, '.git');
    fs.mkdirSync(statusDir, { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'openspec', 'config.yaml'), 'schema: spec-driven');

    const changeName = 'brainstormed-change';
    const brainstormFiles = {
      proposal: '# Custom Proposal',
      design: '# Custom Design',
      tasks: '# Custom Tasks\n- [ ] Task 1',
      specs: {
        'specs/api.md': '# Custom Spec Requirement'
      }
    };

    await commitBrainstormChange(tempDir, changeName, brainstormFiles);

    const changeDir = path.join(tempDir, 'openspec', 'changes', changeName);
    expect(fs.existsSync(path.join(changeDir, 'proposal.md'))).toBe(true);
    expect(fs.readFileSync(path.join(changeDir, 'proposal.md'), 'utf8')).toBe('# Custom Proposal');
    expect(fs.readFileSync(path.join(changeDir, 'design.md'), 'utf8')).toBe('# Custom Design');
    expect(fs.readFileSync(path.join(changeDir, 'tasks.md'), 'utf8')).toBe('# Custom Tasks\n- [ ] Task 1');
    expect(fs.readFileSync(path.join(changeDir, 'specs', 'api.md'), 'utf8')).toBe('# Custom Spec Requirement');
  });
});

describe('Brainstorm API Endpoints', () => {
  const mockFetch = vi.fn();

  beforeAll(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should start a brainstorming session and query LLM', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Question 1: What is the main objective?' }]
            }
          }
        ]
      })
    });

    vi.stubEnv('GEMINI_API_KEY', 'my-api-key');

    const response = await request(app)
      .post('/api/brainstorm/start')
      .send({
        repoPath: '/repo',
        changeName: 'billing-update',
        initialIdea: 'Charge clients in points',
        provider: 'gemini',
        model: 'gemini-1.5-flash'
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: 'Question 1: What is the main objective?' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=my-api-key'),
      expect.any(Object)
    );

    vi.unstubAllEnvs();
  });

  it('should continue brainstorming chat step', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          role: 'assistant',
          content: 'Question 2: Propose point exchange rate.'
        }
      })
    });

    const response = await request(app)
      .post('/api/brainstorm/chat')
      .send({
        repoPath: '/repo',
        changeName: 'billing-update',
        initialIdea: 'Charge clients in points',
        messages: [{ role: 'user', content: 'Use points instead of USD' }],
        provider: 'ollama',
        model: 'gemma2'
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: 'Question 2: Propose point exchange rate.' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"gemma2"')
      })
    );
  });

  it('should commit brainstorm and write files to disk', async () => {
    const fakeLlmJsonResponse = JSON.stringify({
      proposal: '# Brainstormed Proposal',
      design: '# Brainstormed Design',
      tasks: '# Brainstormed Tasks\n- [ ] Task 1',
      specs: {
        'specs/billing.md': '# Brainstormed Spec'
      }
    });

    // Mock Custom provider completions API
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: fakeLlmJsonResponse
            }
          }
        ]
      })
    });

    // Create a mock temp dir representing an openspec repository
    const mockRepoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'openspec-mock-commit-'));
    fs.mkdirSync(path.join(mockRepoPath, '.git'), { recursive: true });
    fs.mkdirSync(path.join(mockRepoPath, 'openspec'), { recursive: true });
    fs.writeFileSync(path.join(mockRepoPath, 'openspec', 'config.yaml'), 'schema: spec-driven');

    const response = await request(app)
      .post('/api/brainstorm/commit')
      .send({
        repoPath: mockRepoPath,
        changeName: 'committed-feature',
        initialIdea: 'Test commit',
        messages: [{ role: 'user', content: 'Finalized plan' }],
        provider: 'custom',
        model: 'gpt-4o',
        customEndpoint: 'https://api.custom.com/v1',
        customApiKey: 'my-key'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const targetChangeDir = path.join(mockRepoPath, 'openspec', 'changes', 'committed-feature');
    expect(fs.existsSync(path.join(targetChangeDir, 'proposal.md'))).toBe(true);
    expect(fs.readFileSync(path.join(targetChangeDir, 'proposal.md'), 'utf8')).toBe('# Brainstormed Proposal');
    expect(fs.readFileSync(path.join(targetChangeDir, 'design.md'), 'utf8')).toBe('# Brainstormed Design');
    expect(fs.readFileSync(path.join(targetChangeDir, 'tasks.md'), 'utf8')).toBe('# Brainstormed Tasks\n- [ ] Task 1');
    expect(fs.readFileSync(path.join(targetChangeDir, 'specs', 'billing.md'), 'utf8')).toBe('# Brainstormed Spec');

    // Clean up
    fs.rmSync(mockRepoPath, { recursive: true, force: true });
  });
});
