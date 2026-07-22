import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
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

describe('API Routes - POST /api/browse-directory', () => {
  it('should accept defaultPath and attempt directory selection', async () => {
    const response = await request(app).post('/api/browse-directory').send({ defaultPath: '~' });
    expect(response.status).toBe(200);
  });
});
