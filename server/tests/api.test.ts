import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import * as repoService from '../src/services/repoService.js';

// Mock the repoService module
vi.mock('../src/services/repoService.js', () => {
  return {
    checkRepoStatus: vi.fn(),
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
