import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as repoService from '../src/services/repoService.js';
import * as dagService from '../src/services/dagService.js';

// Mock the repoService module
vi.mock('../src/services/repoService.js', () => {
  return {
    checkRepoStatus: vi.fn(),
    initializeOpenSpec: vi.fn(),
    createGitWorktree: vi.fn(),
  };
});

// Mock the dagService module
vi.mock('../src/services/dagService.js', () => {
  return {
    getChanges: vi.fn(),
    getChangeDag: vi.fn(),
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
    
    // Stub checkRepoStatus implementation
    vi.mocked(repoService.checkRepoStatus).mockResolvedValueOnce(mockStatus);

    const response = await request(app).get('/api/status?path=/some/valid/path');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockStatus);
    expect(repoService.checkRepoStatus).toHaveBeenCalledWith('/some/valid/path');
  });

  it('should return 200 and exists: false when directory does not exist', async () => {
    const mockStatus = {
      exists: false,
      isGit: false,
      isOpenSpec: false,
    };

    vi.mocked(repoService.checkRepoStatus).mockResolvedValueOnce(mockStatus);

    const response = await request(app).get('/api/status?path=/invalid/path');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockStatus);
  });
});

describe('API Routes - POST /api/init', () => {
  it('should return 400 Bad Request when path is missing', async () => {
    const response = await request(app).post('/api/init').send({});
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing parameter "path"' });
  });

  it('should call initializeOpenSpec and return success', async () => {
    vi.mocked(repoService.initializeOpenSpec).mockResolvedValueOnce(undefined);

    const response = await request(app).post('/api/init').send({ path: '/my/git/repo' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'OpenSpec initialized successfully' });
    expect(repoService.initializeOpenSpec).toHaveBeenCalledWith('/my/git/repo');
  });

  it('should return 500 when command execution fails', async () => {
    vi.mocked(repoService.initializeOpenSpec).mockRejectedValueOnce(new Error('init failed'));

    const response = await request(app).post('/api/init').send({ path: '/my/git/repo' });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'init failed' });
  });
});

describe('API Routes - POST /api/worktree', () => {
  it('should return 400 when parameters are missing', async () => {
    const response = await request(app).post('/api/worktree').send({
      repoPath: '/repo',
      branchName: 'feature/new',
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing parameters');
  });

  it('should call createGitWorktree and return success', async () => {
    vi.mocked(repoService.createGitWorktree).mockResolvedValueOnce(undefined);

    const response = await request(app).post('/api/worktree').send({
      repoPath: '/repo',
      branchName: 'feature/new',
      worktreePath: '/worktrees/new',
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'Git worktree created successfully' });
    expect(repoService.createGitWorktree).toHaveBeenCalledWith('/repo', 'feature/new', '/worktrees/new');
  });

  it('should return 500 when worktree creation fails', async () => {
    vi.mocked(repoService.createGitWorktree).mockRejectedValueOnce(new Error('branch already exists'));

    const response = await request(app).post('/api/worktree').send({
      repoPath: '/repo',
      branchName: 'feature/new',
      worktreePath: '/worktrees/new',
    });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'branch already exists' });
  });
});

describe('API Routes - GET /api/changes', () => {
  it('should return 400 when path is missing', async () => {
    const response = await request(app).get('/api/changes');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing query parameter "path"' });
  });

  it('should return 200 and list of changes', async () => {
    const mockChanges = ['feature-1', 'archive/feature-2'];
    vi.mocked(dagService.getChanges).mockResolvedValueOnce(mockChanges);

    const response = await request(app).get('/api/changes?path=/my/repo');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockChanges);
    expect(dagService.getChanges).toHaveBeenCalledWith('/my/repo');
  });

  it('should return 500 when list changes fails', async () => {
    vi.mocked(dagService.getChanges).mockRejectedValueOnce(new Error('read error'));

    const response = await request(app).get('/api/changes?path=/my/repo');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'read error' });
  });
});

describe('API Routes - GET /api/changes/:change/dag', () => {
  it('should return 400 when path query is missing', async () => {
    const response = await request(app).get('/api/changes/my-change/dag');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing query parameter "path"' });
  });

  it('should return 200 and the computed DAG', async () => {
    const mockDag = {
      nodes: [{ id: '1', label: 'Start', type: 'proposal' as const }],
      edges: [{ source: '1', target: '2' }],
    };
    vi.mocked(dagService.getChangeDag).mockResolvedValueOnce(mockDag);

    const response = await request(app).get('/api/changes/my-change/dag?path=/my/repo');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockDag);
    expect(dagService.getChangeDag).toHaveBeenCalledWith('/my/repo', 'my-change');
  });

  it('should decode url-encoded change names correctly', async () => {
    const mockDag = { nodes: [], edges: [] };
    vi.mocked(dagService.getChangeDag).mockResolvedValueOnce(mockDag);

    // Testing encoded archive path: archive%2Fmy-change
    const response = await request(app).get('/api/changes/archive%2Fmy-change/dag?path=/my/repo');
    expect(response.status).toBe(200);
    expect(dagService.getChangeDag).toHaveBeenCalledWith('/my/repo', 'archive/my-change');
  });

  it('should return 500 when DAG generation fails', async () => {
    vi.mocked(dagService.getChangeDag).mockRejectedValueOnce(new Error('parsing failed'));

    const response = await request(app).get('/api/changes/my-change/dag?path=/my/repo');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'parsing failed' });
  });
});

