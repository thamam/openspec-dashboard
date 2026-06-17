import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Frontend App - App.tsx', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should render the dashboard header and input elements', () => {
    render(<App />);
    expect(screen.getByText('OpenSpec Dashboard')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter local repository absolute path...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify Path' })).toBeInTheDocument();
  });

  it('should display loading indicator, then git/openspec status when check is successful', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exists: true, isGit: true, isOpenSpec: true }),
    });

    render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/my-repo' } });
    fireEvent.click(button);

    // Verify loading state appears
    expect(screen.getByText('Verifying...')).toBeInTheDocument();

    // Verify fetch call parameters
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/status?path=%2FUsers%2Ftest%2Fmy-repo');
    });

    // Verify status displays
    await waitFor(() => {
      expect(screen.getByText('Git: Initialized')).toBeInTheDocument();
      expect(screen.getByText('OpenSpec: Initialized')).toBeInTheDocument();
    });
  });

  it('should display error message when directory does not exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exists: false, isGit: false, isOpenSpec: false }),
    });

    render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/invalid' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Directory does not exist')).toBeInTheDocument();
    });
  });

  it('should display generic error message if api request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/network-error' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });
  });

  it('should show "Initialize OpenSpec" action card when repo has git but no openspec', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exists: true, isGit: true, isOpenSpec: false }),
    });

    render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/git-no-openspec' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Git: Initialized')).toBeInTheDocument();
      expect(screen.getByText('OpenSpec: Not Initialized')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Initialize OpenSpec' })).toBeInTheDocument();
    });

    // Mock successful init response, and then the refetch status
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exists: true, isGit: true, isOpenSpec: true }),
      });

    const initBtn = screen.getByRole('button', { name: 'Initialize OpenSpec' });
    fireEvent.click(initBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/init',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: '/Users/test/git-no-openspec' }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('OpenSpec: Initialized')).toBeInTheDocument();
    });
  });

  it('should show worktree creation form when git and openspec are both initialized', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exists: true, isGit: true, isOpenSpec: true }),
    });

    render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/openspec-project' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Git Worktree Management')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., feature/new-logic')).toBeInTheDocument();
    });

    // Mock successful worktree creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: 'Git worktree created successfully' }),
    });

    const branchInput = screen.getByPlaceholderText('e.g., feature/new-logic');
    const worktreePathInput = screen.getByLabelText('Worktree Destination Path:');
    const createBtn = screen.getByRole('button', { name: 'Create Worktree' });

    fireEvent.change(branchInput, { target: { value: 'feature/widget' } });
    fireEvent.change(worktreePathInput, { target: { value: '/Users/test/openspec-project-worktrees/feature-widget' } });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/worktree',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoPath: '/Users/test/openspec-project',
            branchName: 'feature/widget',
            worktreePath: '/Users/test/openspec-project-worktrees/feature-widget',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Git worktree created successfully')).toBeInTheDocument();
    });
  });
});

