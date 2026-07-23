import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AgentHarness } from '../src/components/AgentHarness';

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

describe('AgentHarness Component', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const mockProps = {
    repoPath: '/tmp/test-repo',
    activeChange: 'feature-test',
    agentProvider: 'codex',
    artifacts: {
      proposal: 'Prop',
      spec: 'Spec',
      design: 'Design',
      tasks: 'Tasks',
      linkages: [
        { source: 'Req1', target: 'Task1' },
        { source: 'Req2', target: 'Task2' }
      ]
    }
  };

  it('renders title, provider badge, active change, and tabs', () => {
    render(<AgentHarness {...mockProps} />);

    expect(screen.getByText('Agent Harness')).toBeDefined();
    expect(screen.getByText('CODEX')).toBeDefined();
    expect(screen.getByText('#feature-test')).toBeDefined();
    expect(screen.getByRole('button', { name: /Live Analysis/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Interactive Chat/i })).toBeDefined();
  });

  it('allows collapsing and expanding the pane', () => {
    render(<AgentHarness {...mockProps} />);

    // Click collapse button
    const collapseBtn = screen.getByRole('button', { name: '_' });
    fireEvent.click(collapseBtn);

    expect(screen.getByText('Agent (CODEX)')).toBeDefined();

    // Click collapsed bar to re-expand
    const collapsedBar = screen.getByTitle('Expand Agent Pane');
    fireEvent.click(collapsedBar);

    expect(screen.getByText('Agent Harness')).toBeDefined();
  });

  it('switches to Interactive Chat tab and allows input', () => {
    render(<AgentHarness {...mockProps} />);

    const chatTab = screen.getByRole('button', { name: /Interactive Chat/i });
    fireEvent.click(chatTab);

    const input = screen.getByPlaceholderText('Ask the agent to modify the dashboard...');
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { value: 'Analyze task status' } });
    expect((input as HTMLInputElement).value).toBe('Analyze task status');

    const form = input.closest('form');
    if (form) fireEvent.submit(form);

    expect(mockSocket.emit).toHaveBeenCalledWith('chat_message', expect.objectContaining({
      message: 'Analyze task status'
    }));
  });

  it('renders dynamic traceability active insight card when linkages exist', () => {
    render(<AgentHarness {...mockProps} />);

    expect(screen.getByText(/2 semantic linkages verified/i)).toBeDefined();
  });
});
