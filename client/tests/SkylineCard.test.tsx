import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SkylineCard } from '../src/components/ArtifactViewer/views/SkylineCard';

describe('SkylineCard Component (Zoom Level 1)', () => {
  beforeEach(() => {
    cleanup();
  });

  const mockArtifacts = {
    proposal: '## Why\nIntegrate Codex CLI provider into dashboard.\n## What Changes\n- Add CodexProvider\n- Update ProviderResolver',
    spec: 'Spec details here',
    design: '## Design Decisions\n- Use detached tmux session\n- Pass dangerously bypass flag',
    tasks: '## Tasks\n- Create `server/src/agents/providers/CodexProvider.ts`',
  };

  it('renders Zoom Level 1 header and active change title', () => {
    render(<SkylineCard artifacts={mockArtifacts} activeChange="add-codex-to-agent-providers" />);

    expect(screen.getByText(/Zoom Level 1 • Skyline Summary/i)).toBeDefined();
    expect(screen.getByText('add-codex-to-agent-providers')).toBeDefined();
  });

  it('renders 1-sentence intent extracted from proposal', () => {
    render(<SkylineCard artifacts={mockArtifacts} activeChange="add-codex-to-agent-providers" />);

    expect(screen.getByText(/"Integrate Codex CLI provider into dashboard."/i)).toBeDefined();
  });

  it('displays Low Risk badge for simple provider changes', () => {
    render(<SkylineCard artifacts={mockArtifacts} activeChange="add-codex-to-agent-providers" />);

    expect(screen.getByText(/LOW RISK/i)).toBeDefined();
  });

  it('triggers onSwitchView when Zoom to Neighborhoods is clicked', () => {
    const handleSwitch = vi.fn();
    render(<SkylineCard artifacts={mockArtifacts} activeChange="add-codex-to-agent-providers" onSwitchView={handleSwitch} />);

    const button = screen.getByRole('button', { name: /Zoom to Neighborhoods/i });
    fireEvent.click(button);

    expect(handleSwitch).toHaveBeenCalledWith('dashboard');
  });

  // C5: "5-Sec Quick Approve" was an alert() placeholder with no backing
  // capability (no approval endpoint/state anywhere) — removed, not wired.
  it('has no 5-Sec Quick Approve button (alert() placeholder removed)', () => {
    render(<SkylineCard artifacts={mockArtifacts} activeChange="add-codex-to-agent-providers" />);

    expect(screen.queryByRole('button', { name: /quick approve/i })).toBeNull();
  });
});

