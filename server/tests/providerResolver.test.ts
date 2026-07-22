import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveProvider } from '../src/agents/ProviderResolver.js';
import { AntiGravityProvider } from '../src/agents/providers/AntiGravityProvider.js';
import { ClaudeProvider } from '../src/agents/providers/ClaudeProvider.js';
import { CodexProvider } from '../src/agents/providers/CodexProvider.js';

describe('Provider Resolver', () => {
  let tempDir: string;
  let mockWorkspace: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-resolver-test-'));
    mockWorkspace = path.join(tempDir, 'workspace');
    fs.mkdirSync(mockWorkspace);
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    vi.stubEnv('AGENT_PROVIDER', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should fallback to AntiGravityProvider by default', () => {
    const provider = resolveProvider(mockWorkspace);
    expect(provider).toBeInstanceOf(AntiGravityProvider);
  });

  it('should resolve ClaudeProvider when AGENT_PROVIDER env variable is set to claude', () => {
    vi.stubEnv('AGENT_PROVIDER', 'claude');
    const provider = resolveProvider(mockWorkspace);
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it('should resolve CodexProvider when AGENT_PROVIDER env variable is set to codex', () => {
    vi.stubEnv('AGENT_PROVIDER', 'codex');
    const provider = resolveProvider(mockWorkspace);
    expect(provider).toBeInstanceOf(CodexProvider);
  });

  it('should resolve ClaudeProvider when change config .openspec.yaml contains agentProvider: claude', () => {
    const changeName = 'mock-change';
    const changeDir = path.join(mockWorkspace, 'openspec', 'changes', changeName);
    fs.mkdirSync(changeDir, { recursive: true });
    
    const configPath = path.join(changeDir, '.openspec.yaml');
    fs.writeFileSync(configPath, 'agentProvider: claude\n', 'utf8');

    const provider = resolveProvider(mockWorkspace, changeName);
    expect(provider).toBeInstanceOf(ClaudeProvider);

    fs.rmSync(changeDir, { recursive: true, force: true });
  });

  it('should resolve CodexProvider when change config .openspec.yaml contains agentProvider: codex', () => {
    const changeName = 'mock-codex-change';
    const changeDir = path.join(mockWorkspace, 'openspec', 'changes', changeName);
    fs.mkdirSync(changeDir, { recursive: true });
    
    const configPath = path.join(changeDir, '.openspec.yaml');
    fs.writeFileSync(configPath, 'agentProvider: codex\n', 'utf8');

    const provider = resolveProvider(mockWorkspace, changeName);
    expect(provider).toBeInstanceOf(CodexProvider);

    fs.rmSync(changeDir, { recursive: true, force: true });
  });

  it('should prioritize change config over AGENT_PROVIDER env variable', () => {
    vi.stubEnv('AGENT_PROVIDER', 'antigravity');

    const changeName = 'mock-change';
    const changeDir = path.join(mockWorkspace, 'openspec', 'changes', changeName);
    fs.mkdirSync(changeDir, { recursive: true });
    
    const configPath = path.join(changeDir, '.openspec.yaml');
    fs.writeFileSync(configPath, 'agentProvider: claude\n', 'utf8');

    const provider = resolveProvider(mockWorkspace, changeName);
    expect(provider).toBeInstanceOf(ClaudeProvider);

    fs.rmSync(changeDir, { recursive: true, force: true });
  });
});
