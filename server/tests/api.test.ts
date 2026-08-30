import { describe, it, expect, vi, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { app } from '../src/app.js';
import * as repoService from '../src/services/repoService.js';

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    exec: vi.fn((cmd: string, cb: any) => {
      if (typeof cb === 'function') {
        cb(null, '/Users/tomerhamam/personal/projects/openspec-dashboard');
      }
    }),
  };
});

// Mock the repoService module
vi.mock('../src/services/repoService.js', () => {
  return {
    checkRepoStatus: vi.fn(),
    initializeOpenSpec: vi.fn(),
    updateChangeProvider: vi.fn(),
    getChangeMetadata: vi.fn(),
    createLocalSchema: vi.fn(),
    createNewChange: vi.fn(),
    resolvePath: vi.fn((p: string) => p),
  };
});

describe('API Routes - GET /api/status', () => {
  it('should return 400 Bad Request when path query param is missing', async () => {
    const response = await request(app).get('/api/status');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Missing query parameter "path"',
    });
  });

  it('should return 200 and repository status when path is valid', async () => {
    const mockStatus = {
      exists: true,
      isGit: true,
      isOpenSpec: false,
    };
    
    vi.mocked(repoService.checkRepoStatus).mockResolvedValueOnce(mockStatus);

    const response = await request(app).get('/api/status?path=/some/valid/path');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockStatus);
    expect(repoService.checkRepoStatus).toHaveBeenCalledWith('/some/valid/path');
  });
});

describe('API Routes - POST /api/init', () => {
  it('should return 400 Bad Request when path is missing', async () => {
    const response = await request(app).post('/api/init').send({});
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing path' });
  });

  it('should call initializeOpenSpec and return success', async () => {
    vi.mocked(repoService.initializeOpenSpec).mockResolvedValueOnce(undefined);

    const response = await request(app).post('/api/init').send({ path: '/my/git/repo' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(repoService.initializeOpenSpec).toHaveBeenCalledWith('/my/git/repo');
  });
});

describe('API Routes - POST /api/changes/:change/provider', () => {
  it('should return 400 when body parameters are missing', async () => {
    const response = await request(app).post('/api/changes/my-change/provider').send({});
    expect(response.status).toBe(400);
  });

  it('should call updateChangeProvider and return 200 on success', async () => {
    vi.mocked(repoService.updateChangeProvider).mockResolvedValueOnce(undefined);

    const response = await request(app)
      .post('/api/changes/my-change/provider')
      .send({ path: '/my/git/repo', provider: 'claude' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(repoService.updateChangeProvider).toHaveBeenCalledWith('/my/git/repo', 'my-change', 'claude');
  });
});

describe('API Routes - POST /api/changes', () => {
  it('should return 400 when repoPath or changeName is missing', async () => {
    const response = await request(app).post('/api/changes').send({ repoPath: '/my/repo' });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing repoPath or changeName' });
  });

  it('should call createNewChange and return success', async () => {
    vi.mocked(repoService.createNewChange).mockResolvedValueOnce(undefined);

    const response = await request(app).post('/api/changes').send({
      repoPath: '/my/repo',
      changeName: 'add-feature',
      schemaName: 'spec-driven',
      description: 'Add new feature',
      proposeEngine: 'antigravity',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, changeName: 'add-feature' });
    expect(repoService.createNewChange).toHaveBeenCalledWith(
      '/my/repo',
      'add-feature',
      'spec-driven',
      'Add new feature',
      'antigravity'
    );
  });
});

describe('API Routes - POST /api/schema', () => {
  it('should return 400 when required parameters are missing', async () => {
    const response = await request(app).post('/api/schema').send({ repoPath: '/my/repo' });
    expect(response.status).toBe(400);
  });

  it('should call createLocalSchema and return success', async () => {
    vi.mocked(repoService.createLocalSchema).mockResolvedValueOnce(undefined);

    const response = await request(app).post('/api/schema').send({
      repoPath: '/my/repo',
      schemaName: 'custom-schema',
      artifacts: ['proposal', 'specs'],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(repoService.createLocalSchema).toHaveBeenCalledWith(
      '/my/repo',
      'custom-schema',
      ['proposal', 'specs']
    );
  });
});

describe('CORS policy (S1)', () => {
  it('should reflect the Access-Control-Allow-Origin header for the Vite dev origin', async () => {
    const response = await request(app)
      .get('/api/status')
      .set('Origin', 'http://localhost:5183');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5183');
  });

  it('should not emit Access-Control-Allow-Origin for disallowed origins', async () => {
    const response = await request(app)
      .get('/api/status')
      .set('Origin', 'http://evil.com');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should allow requests without an Origin header (curl, server-to-server)', async () => {
    const response = await request(app).get('/api/status');
    // Route still executes; 400 here is the route's own missing-param response.
    expect(response.status).toBe(400);
  });
});

describe('API Routes - POST /api/browse-directory', () => {
  it('should accept defaultPath and attempt directory selection', async () => {
    const response = await request(app).post('/api/browse-directory').send({ defaultPath: '~' });
    expect(response.status).toBe(200);
  });
});

describe('POST /api/execute — shell injection hardening (S2)', () => {
  const pwnPath = path.join(os.tmpdir(), `s2-pwn-${process.pid}-${Date.now()}`);

  afterAll(() => {
    // Cleanup in case a regression ever lets the payload execute
    try { fs.rmSync(pwnPath, { force: true }); } catch { /* ignore */ }
  });

  it('rejects args containing $() command substitution and does not execute them', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: os.tmpdir(),
      command: 'echo',
      args: [`$(touch ${pwnPath})`],
    });
    expect(response.status).toBe(400);
    // Asserting the specific error isolates the args guard (repoPath
    // validation would 400 with a different message)
    expect(response.body.error).toMatch(/Invalid args/);
    expect(fs.existsSync(pwnPath)).toBe(false);
  });

  it('rejects args containing ; command chaining and does not execute them', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: os.tmpdir(),
      command: 'echo',
      args: [`hello; touch ${pwnPath}`],
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid args/);
    expect(fs.existsSync(pwnPath)).toBe(false);
  });

  it('rejects a repoPath containing shell metacharacters', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: `/tmp/x"; touch ${pwnPath}; #`,
      command: 'echo',
      args: ['hello'],
    });
    expect(response.status).toBe(400);
    expect(fs.existsSync(pwnPath)).toBe(false);
  });

  it('rejects rm (removed from the allowlist)', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: os.tmpdir(),
      command: 'rm',
      args: ['-f', pwnPath],
    });
    expect(response.status).toBe(400);
  });

  it('rejects an invalid repoPath', async () => {
    vi.mocked(repoService.checkRepoStatus).mockResolvedValueOnce({
      exists: false, isGit: false, isOpenSpec: false,
    });
    const response = await request(app).post('/api/execute').send({
      repoPath: '/nonexistent/s2-path',
      command: 'echo',
      args: ['hello'],
    });
    expect(response.status).toBe(400);
  });

  it('still executes a legitimate allowlisted command', async () => {
    vi.mocked(repoService.checkRepoStatus).mockResolvedValueOnce({
      exists: true, isGit: true, isOpenSpec: true,
    });
    const response = await request(app).post('/api/execute').send({
      repoPath: os.tmpdir(),
      command: 'echo',
      args: ['hello-s2'],
    });
    expect(response.status).toBe(200);
    expect(response.text).toContain('hello-s2');
  });

  it('does not glob-expand args (proves shell:false)', async () => {
    vi.mocked(repoService.checkRepoStatus).mockResolvedValueOnce({
      exists: true, isGit: true, isOpenSpec: true,
    });
    const response = await request(app).post('/api/execute').send({
      repoPath: os.tmpdir(),
      command: 'echo',
      args: ['*'],
    });
    expect(response.status).toBe(200);
    // With a shell, '*' would expand to the cwd listing instead of a literal '*'
    expect(response.text).toMatch(/^\*$/m);
  });

  it('rejects shell metacharacters in changeName (provider lifecycle path)', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: os.tmpdir(),
      command: 'opsx-apply',
      changeName: `x"; touch ${pwnPath}; #`,
    });
    expect(response.status).toBe(400);
    // Specific error isolates the changeName guard (it runs before repo validation)
    expect(response.body.error).toMatch(/Invalid changeName/);
    expect(fs.existsSync(pwnPath)).toBe(false);
  });

  it('rejects non-array args (Node would treat an object as spawn options)', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: os.tmpdir(),
      command: 'echo',
      args: { cwd: '/etc', env: { PWNED: '1' } },
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid args/);
  });
});
