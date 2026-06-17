import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as repoService from '../src/services/repoService.js';

// Mock the repoService module
vi.mock('../src/services/repoService.js', () => {
  return {
    checkRepoStatus: vi.fn(),
    initializeOpenSpec: vi.fn(),
    createGitWorktree: vi.fn(),
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

