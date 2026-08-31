import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';

// Mock spawn only (LocalAgentWrapper.chat spawns `agy`); keep execFile real so
// keystoneService's git calls and the REST endpoints behave normally.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, spawn: vi.fn() };
});

const mockedSpawn = vi.mocked(spawn);

function fakeChild(exitCode = 0) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const origOn = child.on.bind(child);
  child.on = (event: string, listener: (...args: any[]) => void) => {
    origOn(event, listener);
    if (event === 'close') {
      process.nextTick(() => child.emit('close', exitCode));
    }
    return child;
  };
  return child;
}

import { app } from '../src/app.js';
import { getKeystoneManifest } from '../src/services/keystoneService.js';
import { resolveProvider } from '../src/agents/ProviderResolver.js';
import { ClaudeProvider } from '../src/agents/providers/ClaudeProvider.js';
import { CodexProvider } from '../src/agents/providers/CodexProvider.js';
import { LocalAgentWrapper } from '../src/services/LocalAgentWrapper.js';

// S6 exploit tests: every fixture puts a SENTINEL just outside the intended
// root and asserts the payload never crosses the boundary (no out-of-root
// read into a response, no out-of-root write).

describe('S6 — GET /api/artifacts path traversal', () => {
  let tempDir: string;
  let repoDir: string;
  let sentinelDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 's6-artifacts-'));
    repoDir = path.join(tempDir, 'repo');
    const changeDir = path.join(repoDir, 'openspec', 'changes', 'legit-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, 'proposal.md'), '# Legit proposal\n');

    // Sentinel OUTSIDE openspec/changes: tempDir/sentinel-outside/proposal.md
    sentinelDir = path.join(tempDir, 'sentinel-outside');
    fs.mkdirSync(sentinelDir);
    fs.writeFileSync(path.join(sentinelDir, 'proposal.md'), 'SENTINEL-SECRET-CONTENT\n');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves a legitimate change normally', async () => {
    const res = await request(app).get(
      `/api/artifacts?path=${encodeURIComponent(repoDir)}&change=legit-change`
    );
    expect(res.status).toBe(200);
    expect(res.body.artifacts.proposal).toContain('Legit proposal');
  });

  it.each([
    ['../../../sentinel-outside', 'dot-dot slashes'],
    ['..', 'bare dot-dot'],
    ['.', 'bare dot'],
    ['/etc', 'absolute-looking segment'],
    ['..\\..\\sentinel-outside', 'backslash variant'],
  ])('rejects traversal change=%s (%s) with 400 and leaks nothing', async (change) => {
    const res = await request(app).get(
      `/api/artifacts?path=${encodeURIComponent(repoDir)}&change=${encodeURIComponent(change)}`
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL-SECRET-CONTENT');
  });

  it('rejects URL-encoded ..%2f traversal (decoded upstream by Express)', async () => {
    const res = await request(app).get(
      `/api/artifacts?path=${encodeURIComponent(repoDir)}&change=..%2f..%2f..%2fsentinel-outside`
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('SENTINEL-SECRET-CONTENT');
  });
});

describe('S6 — POST /api/changes/:change/provider path traversal write', () => {
  let tempDir: string;
  let repoDir: string;
  let sentinelFile: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 's6-provider-'));
    repoDir = path.join(tempDir, 'repo');
    const changeDir = path.join(repoDir, 'openspec', 'changes', 'real-change');
    fs.mkdirSync(changeDir, { recursive: true });
    fs.writeFileSync(path.join(changeDir, '.openspec.yaml'), 'schema: "spec-driven"\n');

    // Sentinel .openspec.yaml OUTSIDE the repo; a traversal write lands here.
    const sentinelDir = path.join(tempDir, 'escape-target');
    fs.mkdirSync(sentinelDir);
    sentinelFile = path.join(sentinelDir, '.openspec.yaml');
    fs.writeFileSync(sentinelFile, 'agentProvider: codex\n');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('updates the provider for a legitimate change', async () => {
    const res = await request(app)
      .post('/api/changes/real-change/provider')
      .send({ path: repoDir, provider: 'claude' });
    expect(res.status).toBe(200);
    const written = fs.readFileSync(
      path.join(repoDir, 'openspec', 'changes', 'real-change', '.openspec.yaml'),
      'utf8'
    );
    expect(written).toContain('claude');
  });

  it('rejects ..%2f change param and never writes outside the repo', async () => {
    const res = await request(app)
      .post('/api/changes/..%2f..%2f..%2fescape-target/provider')
      .send({ path: repoDir, provider: 'claude' });
    expect([400, 403]).toContain(res.status);
    expect(fs.readFileSync(sentinelFile, 'utf8')).toBe('agentProvider: codex\n');
  });
});

describe('S6 — keystoneService manifest row.path traversal', () => {
  let tempDir: string;
  let repoDir: string;
  let sentinelFile: string;

  const writeManifest = (rows: string) => {
    fs.writeFileSync(
      path.join(repoDir, '.aidev', 'manifest.yaml'),
      ['handshake: "0.1"', 'project:', '  id: s6-fixture', 'artifacts:', rows, ''].join('\n')
    );
  };

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 's6-keystone-'));
    repoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(path.join(repoDir, '.aidev', 'artifacts'), { recursive: true });

    // Sentinel JSON OUTSIDE the repo that a malicious manifest would read.
    sentinelFile = path.join(tempDir, 'sentinel-secret.json');
    fs.writeFileSync(
      sentinelFile,
      JSON.stringify({ format: 'review-findings', marker: 'SENTINEL-LEAKED', payload: { findings: [] } })
    );

    // Legit in-repo artifact that must keep working.
    fs.writeFileSync(
      path.join(repoDir, '.aidev', 'artifacts', 'review.json'),
      JSON.stringify({
        format: 'review-findings',
        format_version: '0.1',
        project_id: 's6-fixture',
        source_sha: 'x',
        generated_by: 'test',
        generated_at: '2026-08-30T00:00:00Z',
        payload: { findings: [{ id: 'OK-1', file: 'a.ts', line: 1, severity: 'minor', title: 'legit', status: 'open' }] },
      })
    );
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('refuses to read an envelope from a ../ escaping row.path', async () => {
    writeManifest(
      ['  - kind: review', '    path: ../sentinel-secret.json', '    format: review-findings/0.1', '    source_sha: x'].join('\n')
    );
    const result = await getKeystoneManifest(repoDir);
    expect(result.enabled).toBe(true);
    expect(result.artifacts![0].review ?? null).toBeNull();
    expect(JSON.stringify(result)).not.toContain('SENTINEL-LEAKED');
  });

  it('refuses to read an envelope from an absolute row.path', async () => {
    writeManifest(
      ['  - kind: wiki', `    path: ${sentinelFile}`, '    format: wiki/1', '    source_sha: x'].join('\n')
    );
    const result = await getKeystoneManifest(repoDir);
    expect(result.artifacts![0].wiki ?? null).toBeNull();
    expect(JSON.stringify(result)).not.toContain('SENTINEL-LEAKED');
  });

  it('still reads a legitimate in-repo nested row.path', async () => {
    writeManifest(
      ['  - kind: review', '    path: .aidev/artifacts/review.json', '    format: review-findings/0.1', '    source_sha: x'].join('\n')
    );
    const result = await getKeystoneManifest(repoDir);
    expect(result.artifacts![0].review).toBeTruthy();
    expect(result.artifacts![0].review!.payload.findings[0].id).toBe('OK-1');
  });
});

describe('S6 — ProviderResolver out-of-root change config read', () => {
  let tempDir: string;
  let workspace: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 's6-resolver-'));
    workspace = path.join(tempDir, 'workspace');
    fs.mkdirSync(workspace);
    // Sentinel config OUTSIDE the workspace that a traversal changeName reads.
    const sentinelDir = path.join(tempDir, 'sentinel-provider');
    fs.mkdirSync(sentinelDir);
    fs.writeFileSync(path.join(sentinelDir, '.openspec.yaml'), 'agentProvider: claude\n');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('ignores a traversal changeName instead of reading config outside the workspace', () => {
    // workspace/openspec/changes/../../../sentinel-provider → tempDir/sentinel-provider
    const provider = resolveProvider(workspace, '../../../sentinel-provider');
    expect(provider).not.toBeInstanceOf(ClaudeProvider);
    expect(provider).toBeInstanceOf(CodexProvider);
  });
});

describe('S6 — LocalAgentWrapper.chat activeChange traversal (dir listing leak into prompt)', () => {
  let tempDir: string;
  let repoDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 's6-chat-'));
    repoDir = path.join(tempDir, 'repo');
    fs.mkdirSync(repoDir);
    // Sentinel dir OUTSIDE openspec/changes with a telltale filename.
    const sentinelDir = path.join(tempDir, 'sentinel-chat');
    fs.mkdirSync(sentinelDir);
    fs.writeFileSync(path.join(sentinelDir, 'chat-secret-file.md'), 'x');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not list directories outside openspec/changes into the agy prompt', async () => {
    vi.stubEnv('TEST_MODE', 'false');
    mockedSpawn.mockReset();
    mockedSpawn.mockReturnValue(fakeChild(0));
    try {
      const wrapper = new LocalAgentWrapper();
      await wrapper.chat(repoDir, 'hi', { activeChange: '../../../sentinel-chat' }, () => {});
      expect(mockedSpawn).toHaveBeenCalledTimes(1);
      const args = mockedSpawn.mock.calls[0][1] as string[];
      const promptArg = args.find((a) => a.startsWith('--prompt=')) ?? '';
      expect(promptArg).not.toContain('chat-secret-file.md');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
