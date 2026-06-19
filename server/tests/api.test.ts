import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
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
    createLocalSchema: vi.fn(),
    createNewChange: vi.fn(),
    getChangeMetadata: vi.fn(),
    updateProposeEngine: vi.fn(),
    getChangeFilesContent: vi.fn(),
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

describe('API Routes - POST /api/schema', () => {
  it('should return 400 when parameters are missing', async () => {
    const response = await request(app).post('/api/schema').send({
      repoPath: '/repo',
      schemaName: 'custom-flow'
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing parameters');
  });

  it('should call createLocalSchema and return success', async () => {
    vi.mocked(repoService.createLocalSchema).mockResolvedValueOnce(undefined);

    const response = await request(app).post('/api/schema').send({
      repoPath: '/repo',
      schemaName: 'custom-flow',
      artifacts: ['proposal', 'tasks']
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'Local schema initialized successfully' });
    expect(repoService.createLocalSchema).toHaveBeenCalledWith('/repo', 'custom-flow', ['proposal', 'tasks']);
  });

  it('should return 500 when schema creation fails', async () => {
    vi.mocked(repoService.createLocalSchema).mockRejectedValueOnce(new Error('init failed'));

    const response = await request(app).post('/api/schema').send({
      repoPath: '/repo',
      schemaName: 'custom-flow',
      artifacts: ['proposal']
    });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'init failed' });
  });
});

describe('API Routes - POST /api/changes', () => {
  it('should return 400 when required parameters are missing', async () => {
    const response = await request(app).post('/api/changes').send({
      repoPath: '/repo'
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing parameters');
  });

  it('should call createNewChange and return success with optional proposeEngine', async () => {
    vi.mocked(repoService.createNewChange).mockResolvedValueOnce(undefined);

    const response = await request(app).post('/api/changes').send({
      repoPath: '/repo',
      changeName: 'my-feature',
      schemaName: 'custom-flow',
      description: 'my description',
      proposeEngine: 'claude'
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'Change proposal created successfully' });
    expect(repoService.createNewChange).toHaveBeenCalledWith('/repo', 'my-feature', 'custom-flow', 'my description', 'claude');
  });

  it('should return 500 when change creation fails', async () => {
    vi.mocked(repoService.createNewChange).mockRejectedValueOnce(new Error('creation failed'));

    const response = await request(app).post('/api/changes').send({
      repoPath: '/repo',
      changeName: 'my-feature'
    });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'creation failed' });
  });
});

describe('API Routes - GET /api/changes/:change', () => {
  it('should return 400 when path is missing', async () => {
    const response = await request(app).get('/api/changes/my-change');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Missing query parameter "path"' });
  });

  it('should call getChangeMetadata and return metadata', async () => {
    const mockMetadata = {
      name: 'my-change',
      schema: 'spec-driven',
      created: '2026-06-17',
      description: 'nice change',
      proposeEngine: 'claude',
    };
    vi.mocked(repoService.getChangeMetadata).mockResolvedValueOnce(mockMetadata);

    const response = await request(app).get('/api/changes/my-change?path=/repo');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(mockMetadata);
    expect(repoService.getChangeMetadata).toHaveBeenCalledWith('/repo', 'my-change');
  });

  it('should return 500 when getChangeMetadata fails', async () => {
    vi.mocked(repoService.getChangeMetadata).mockRejectedValueOnce(new Error('read failed'));

    const response = await request(app).get('/api/changes/my-change?path=/repo');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'read failed' });
  });
});

describe('API Routes - POST /api/changes/:change/engine', () => {
  it('should return 400 when parameters are missing', async () => {
    const response = await request(app).post('/api/changes/my-change/engine').send({
      repoPath: '/repo',
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing parameters');
  });

  it('should call updateProposeEngine and return success', async () => {
    vi.mocked(repoService.updateProposeEngine).mockResolvedValueOnce(undefined);

    const response = await request(app).post('/api/changes/my-change/engine').send({
      repoPath: '/repo',
      proposeEngine: 'cursor',
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'Propose engine updated successfully' });
    expect(repoService.updateProposeEngine).toHaveBeenCalledWith('/repo', 'my-change', 'cursor');
  });

  it('should return 500 when update fails', async () => {
    vi.mocked(repoService.updateProposeEngine).mockRejectedValueOnce(new Error('update failed'));

    const response = await request(app).post('/api/changes/my-change/engine').send({
      repoPath: '/repo',
      proposeEngine: 'cursor',
    });
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'update failed' });
  });
});

describe('API Routes - POST /api/changes/:change/chat', () => {
  const mockFetch = vi.fn();

  beforeAll(() => {
    vi.stubGlobal('fetch', mockFetch);
    // Setup default mock values for repo/dag services
    vi.mocked(repoService.getChangeFilesContent).mockReturnValue('=== FILE: proposal.md ===\nproposal content');
    vi.mocked(dagService.getChangeDag).mockResolvedValue({ nodes: [], edges: [] });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should return 400 when required parameters are missing', async () => {
    const response = await request(app)
      .post('/api/changes/my-change/chat')
      .send({ repoPath: '/repo' });
    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Missing or invalid parameter');
  });

  it('should call Gemini API successfully when api key is present', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello from Gemini!' }]
            }
          }
        ]
      })
    });

    const response = await request(app)
      .post('/api/changes/my-change/chat')
      .send({
        repoPath: '/repo',
        messages: [{ role: 'user', content: 'hello' }],
        provider: 'gemini',
        model: 'gemini-1.5-flash'
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: 'Hello from Gemini!' });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=test-api-key'),
      expect.any(Object)
    );

    vi.unstubAllEnvs();
  });

  it('should return 400 when Gemini API key is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');

    const response = await request(app)
      .post('/api/changes/my-change/chat')
      .send({
        repoPath: '/repo',
        messages: [{ role: 'user', content: 'hello' }],
        provider: 'gemini',
        model: 'gemini-1.5-flash'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Gemini API key is not configured');

    vi.unstubAllEnvs();
  });

  it('should proxy Ollama API successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        message: {
          role: 'assistant',
          content: 'Hello from Ollama!'
        }
      })
    });

    const response = await request(app)
      .post('/api/changes/my-change/chat')
      .send({
        repoPath: '/repo',
        messages: [{ role: 'user', content: 'hello' }],
        provider: 'ollama',
        model: 'gemma2'
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: 'Hello from Ollama!' });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"gemma2"')
      })
    );
  });

  it('should proxy Custom API successfully with custom API key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Hello from Custom API!'
            }
          }
        ]
      })
    });

    const response = await request(app)
      .post('/api/changes/my-change/chat')
      .send({
        repoPath: '/repo',
        messages: [{ role: 'user', content: 'hello' }],
        provider: 'custom',
        model: 'my-custom-model',
        customEndpoint: 'https://api.custom.com/v1',
        customApiKey: 'my-key'
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reply: 'Hello from Custom API!' });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.custom.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer my-key'
        })
      })
    );
  });
});

