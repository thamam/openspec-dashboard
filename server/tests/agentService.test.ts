import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LocalAgentWrapper } from '../src/services/LocalAgentWrapper.js';

describe('LocalAgentWrapper', () => {
  let tempDir: string;
  let wrapper: LocalAgentWrapper;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wrapper-test-'));
    wrapper = new LocalAgentWrapper();
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    vi.stubEnv('TEST_MODE', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should stream chunks and return structured analysis result in test mode', async () => {
    const chunks: string[] = [];
    const filePath = path.join(tempDir, 'test-file.md');
    fs.writeFileSync(filePath, '# Test content');

    const result = await wrapper.analyzeFile(tempDir, filePath, (chunk) => {
      chunks.push(chunk);
    });

    expect(chunks.length).toBeGreaterThan(0);
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('message');
  });

  it('should handle chat streams with context in test mode', async () => {
    const chunks: string[] = [];
    await wrapper.chat(tempDir, 'Hello agent', { activeChange: 'test-change', agentProvider: 'codex' }, (chunk) => {
      chunks.push(chunk);
    });

    expect(chunks.join('')).toContain('Hello agent');
  });

  it('should execute workflow streams in test mode', async () => {
    const chunks: string[] = [];
    await wrapper.executeWorkflow(tempDir, 'opsx-continue', 'test-change', [], (chunk) => {
      chunks.push(chunk);
    });

    expect(chunks.join('')).toContain('opsx-continue');
    expect(chunks.join('')).toContain('test-change');
  });

  it('should autofix files in test mode', async () => {
    const filePath = path.join(tempDir, 'autofix-me.md');
    fs.writeFileSync(filePath, '# Before autofix');

    await wrapper.autofix(tempDir, filePath, 'Policy violation alert');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).toContain('Fixed in Test Mode');
  });
});
