import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
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

  it('should display loading indicator, then enter app when check is successful', async () => {
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

    // Verify we entered the app (verify gate is gone, sidebar is rendered)
    await waitFor(() => {
      expect(screen.queryByText('Connect a repository')).not.toBeInTheDocument();
      expect(screen.getByText('OpenSpec')).toBeInTheDocument();
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

  it('should show "Initialize OpenSpec" action in plumbing menu when repo has git but no openspec', async () => {
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
      expect(screen.queryByText('Connect a repository')).not.toBeInTheDocument();
      expect(screen.getByText('OpenSpec')).toBeInTheDocument();
    });

    // Open plumbing menu
    const plumbingTrigger = screen.getByTitle('Repo & setup');
    fireEvent.click(plumbingTrigger);

    // Expect menu item to be in document
    const initItem = screen.getByText('Initialize OpenSpec');
    expect(initItem).toBeInTheDocument();

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

    fireEvent.click(initItem);

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
      expect(screen.queryByText('Connect a repository')).not.toBeInTheDocument();
    });

    // Open plumbing menu
    const plumbingTrigger = screen.getByTitle('Repo & setup');
    fireEvent.click(plumbingTrigger);

    // Click Create Worktree…
    const worktreeItem = screen.getByText('Create Worktree…');
    fireEvent.click(worktreeItem);

    // Expect modal to open
    expect(screen.getByText('Create Git Worktree')).toBeInTheDocument();

    // Mock successful worktree creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: 'Git worktree created successfully' }),
    });

    const branchInput = screen.getByPlaceholderText('e.g., feature/login-flow');
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
  });

  it('should support showing and submitting the CreateChangeForm within App', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exists: true, isGit: true, isOpenSpec: true }),
    });

    render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/my-openspec-repo' } });
    fireEvent.click(button);

    // Verify + New Change button is visible
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ New Change' })).toBeInTheDocument();
    });

    const createNewBtn = screen.getByRole('button', { name: '+ New Change' });
    fireEvent.click(createNewBtn);

    // Form should now render inside modal
    expect(screen.getByLabelText('Change Name (kebab-case):')).toBeInTheDocument();

    // Mock successful change creation response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    // Mock the subsequent fetchChanges called on success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => (['new-login']),
    });

    // Mock subsequent dag load call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ nodes: [], edges: [] }),
    });

    // Mock subsequent metadata load call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'new-login',
        schema: 'spec-driven',
        created: '2026-06-17',
        description: '',
        proposeEngine: 'gemini',
      }),
    });

    const nameInput = screen.getByLabelText('Change Name (kebab-case):');
    const submitBtn = screen.getByRole('button', { name: 'Create Change' });

    fireEvent.change(nameInput, { target: { value: 'new-login' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/changes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            repoPath: '/Users/test/my-openspec-repo',
            changeName: 'new-login',
            schemaName: 'spec-driven',
            description: '',
            proposeEngine: 'gemini',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Change "new-login" created successfully.')).toBeInTheDocument();
      // Form should be closed
      expect(screen.queryByLabelText('Change Name (kebab-case):')).not.toBeInTheDocument();
    });
  });
});


