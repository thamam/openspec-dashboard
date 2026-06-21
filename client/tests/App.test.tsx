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

  it('should support manual change of the sidebar width via drag resizing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exists: true, isGit: true, isOpenSpec: true }),
    });

    const { container } = render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/my-repo' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.queryByText('Connect a repository')).not.toBeInTheDocument();
    });

    const sidebar = container.querySelector('.sidebar') as HTMLElement;
    expect(sidebar).toBeInTheDocument();
    expect(sidebar.style.width).toBe('240px');

    const resizer = container.querySelector('.sidebar-resizer') as HTMLElement;
    expect(resizer).toBeInTheDocument();

    // Mouse down on the resizer
    fireEvent.mouseDown(resizer, { clientX: 240 });
    // Mouse move on document to increase width (drag right by 60px)
    fireEvent.mouseMove(document, { clientX: 300 });
    fireEvent.mouseUp(document);

    expect(sidebar.style.width).toBe('300px');

    // Drag past bounds (e.g. down to 100px - min is 180px)
    fireEvent.mouseDown(resizer, { clientX: 300 });
    fireEvent.mouseMove(document, { clientX: 100 });
    fireEvent.mouseUp(document);
    // Should NOT have changed to 100px because min width is 180px
    expect(sidebar.style.width).toBe('300px');
  });

  it('should support manual change of the tool dock width via drag resizing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exists: true, isGit: true, isOpenSpec: true }),
    });

    const { container } = render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/my-repo' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.queryByText('Connect a repository')).not.toBeInTheDocument();
    });

    // Open the tool-dock by clicking "Grill Me" button
    const grillBtn = screen.getByTitle('Grill Me — pressure-test');
    fireEvent.click(grillBtn);

    const toolDock = container.querySelector('.tool-dock') as HTMLElement;
    expect(toolDock).toBeInTheDocument();
    expect(toolDock.style.width).toBe('388px');

    const resizer = container.querySelector('.tool-dock-resizer') as HTMLElement;
    expect(resizer).toBeInTheDocument();

    // Mouse down on the resizer
    fireEvent.mouseDown(resizer, { clientX: 600 });
    // Drag left by 100px (clientX: 500) to increase tool dock width (starts at right side, drag left increases width)
    fireEvent.mouseMove(document, { clientX: 500 });
    fireEvent.mouseUp(document);

    expect(toolDock.style.width).toBe('488px');

    // Drag past bounds (e.g. right by 500px, which violates min dock width 280px)
    fireEvent.mouseDown(resizer, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 1000 });
    fireEvent.mouseUp(document);
    // Should NOT change because bounds are violated
    expect(toolDock.style.width).toBe('488px');
  });

  it('should display red dot and Update Init button when isTraceReady is false, and update status on click', async () => {
    // 1. Initial repo status check (exists: true, isGit: true, isOpenSpec: true, isTraceReady: false)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exists: true, isGit: true, isOpenSpec: true, isTraceReady: false }),
    });

    const { container } = render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/outdated-repo' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.queryByText('Connect a repository')).not.toBeInTheDocument();
    });

    // Verify dot style has var(--red)
    const dot = container.querySelector('.sidebar-repo-dot') as HTMLElement;
    expect(dot).toBeInTheDocument();
    expect(dot.style.background).toBe('var(--red)');

    // Verify Update Init button is in the document
    const updateBtn = screen.getByRole('button', { name: 'Update Init' });
    expect(updateBtn).toBeInTheDocument();

    // 2. Mock successful /api/init and then status check returning isTraceReady: true
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ exists: true, isGit: true, isOpenSpec: true, isTraceReady: true, repoRoot: '/Users/test/outdated-repo' }),
      });

    fireEvent.click(updateBtn);

    // Verify dot style updates to var(--green) and button is hidden
    await waitFor(() => {
      expect(dot.style.background).toBe('var(--green)');
    });

    expect(screen.queryByRole('button', { name: 'Update Init' })).not.toBeInTheDocument();
  });

  it('should display worktree trace update selection modal when repo has multiple connected worktrees', async () => {
    // 1. Initial repo status check with 3 connected worktrees (main and 2 sub-worktrees)
    const mockWorktrees = [
      { path: '/Users/test/outdated-repo', branch: 'main', isMain: true },
      { path: '/Users/test/wt-1', branch: 'feature-1', isMain: false },
      { path: '/Users/test/wt-2', branch: 'feature-2', isMain: false },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        exists: true,
        isGit: true,
        isOpenSpec: true,
        isTraceReady: false,
        repoRoot: '/Users/test/outdated-repo',
        worktrees: mockWorktrees
      }),
    });

    const { container } = render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/outdated-repo' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.queryByText('Connect a repository')).not.toBeInTheDocument();
    });

    const updateBtn = screen.getByRole('button', { name: 'Update Init' });
    expect(updateBtn).toBeInTheDocument();

    // Click Update Init to show the worktree dialog modal
    fireEvent.click(updateBtn);

    // Verify modal is displayed
    expect(screen.getByText('Update Connected Worktrees')).toBeInTheDocument();
    expect(screen.getByText(/This repository has other connected Git worktrees/)).toBeInTheDocument();

    // Click Custom Selection button to open checkbox selection list
    const customBtn = screen.getByRole('button', { name: 'Custom Selection...' });
    fireEvent.click(customBtn);

    // Verify checkboxes are rendered for worktree paths
    expect(screen.getByText('/Users/test/wt-1')).toBeInTheDocument();
    expect(screen.getByText('/Users/test/wt-2')).toBeInTheDocument();

    // Get the enabled checkbox
    const checkboxes = screen.getAllByRole('checkbox');
    const wt1CheckboxEnabled = checkboxes.filter(el => !el.hasAttribute('disabled'))[0] as HTMLInputElement;
    expect(wt1CheckboxEnabled).toBeInTheDocument();

    // Mock successful API response for init, and status check
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          exists: true,
          isGit: true,
          isOpenSpec: true,
          isTraceReady: true,
          repoRoot: '/Users/test/outdated-repo',
          worktrees: mockWorktrees
        }),
      });

    // Check one worktree and click Update Selected
    fireEvent.click(wt1CheckboxEnabled);
    const submitBtn = screen.getByRole('button', { name: /Update Selected/ });
    fireEvent.click(submitBtn);

    // Wait for modal to close and status dot to update to green
    await waitFor(() => {
      expect(screen.queryByText('Update Connected Worktrees')).not.toBeInTheDocument();
    });

    const dot = container.querySelector('.sidebar-repo-dot') as HTMLElement;
    expect(dot.style.background).toBe('var(--green)');
  });
});
