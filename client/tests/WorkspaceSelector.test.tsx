import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { WorkspaceSelector } from '../src/components/WorkspaceSelector.js';

describe('WorkspaceSelector Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders workspace input, Load button, and Recent dropdown', () => {
    const handleSelect = vi.fn();
    render(<WorkspaceSelector currentPath="/tmp/my-project" onSelectPath={handleSelect} />);

    expect(screen.getByText('Workspace:')).toBeInTheDocument();
    expect(screen.getByDisplayValue('/tmp/my-project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recent/i })).toBeInTheDocument();
  });

  it('triggers onSelectPath when Load button is clicked', () => {
    const handleSelect = vi.fn();
    render(<WorkspaceSelector currentPath="/tmp/my-project" onSelectPath={handleSelect} />);

    const input = screen.getByDisplayValue('/tmp/my-project');
    fireEvent.change(input, { target: { value: '~/personal/my-repo' } });

    const loadButton = screen.getByRole('button', { name: 'Load' });
    fireEvent.click(loadButton);

    expect(handleSelect).toHaveBeenCalledWith('~/personal/my-repo');
  });

  it('shows recent items when Recent dropdown is toggled', () => {
    localStorage.setItem('openspec_recent_workspaces', JSON.stringify(['~/repo-1', '~/repo-2']));
    const handleSelect = vi.fn();

    render(<WorkspaceSelector currentPath="~/repo-1" onSelectPath={handleSelect} />);

    const recentButton = screen.getByRole('button', { name: /Recent/i });
    fireEvent.click(recentButton);

    expect(screen.getByText('Recent Workspaces')).toBeInTheDocument();
    expect(screen.getByText('~/repo-2')).toBeInTheDocument();

    fireEvent.click(screen.getByText('~/repo-2'));
    expect(handleSelect).toHaveBeenCalledWith('~/repo-2');
  });
});
