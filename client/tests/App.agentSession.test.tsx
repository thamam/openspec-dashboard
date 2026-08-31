import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import App from '../src/App.js';

// C16 regression tests: the active agent session is explicit App state — set by
// `tmux attach -t <agent-N>` and cleared by `exit`/`disconnect` — and it drives
// both the /api/send-message routing branch and TerminalPane's attach button.
// The old log-derived detection was dead: every /api/execute reply ends with
// `[Process exited with code N]`, so the exit-marker heuristic always read the
// session as gone.

const mockFetch = vi.fn();
global.fetch = mockFetch;

// xterm (rendered by TerminalPane inside App) probes matchMedia on open.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function jsonResponse(body: any, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

// Flush fetch -> json -> setState chains.
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

function sendCalls() {
  return mockFetch.mock.calls.filter((call) => call[0] === '/api/send-message');
}

function executeCalls() {
  return mockFetch.mock.calls.filter((call) => call[0] === '/api/execute');
}

describe('App agent-session routing (C16)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    window.history.replaceState({}, '', '/');
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/changes')) return Promise.resolve(jsonResponse([]));
      // /api/execute replies are streamed; body:undefined makes the drain
      // loop a no-op, which is all these tests need.
      if (url === '/api/execute') return Promise.resolve({ ok: true, body: undefined });
      if (url === '/api/send-message') return Promise.resolve(jsonResponse({ ok: true }));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
  });

  function submitCommand(value: string) {
    const input = screen.getByPlaceholderText(/Type command or input/i);
    fireEvent.change(input, { target: { value } });
    fireEvent.submit(input.closest('form')!);
  }

  it('routes commands to /api/send-message after `tmux attach -t agent-N`, and shows the attach button', async () => {
    render(<App />);
    await flush();

    submitCommand('tmux attach -t agent-5');
    await flush();

    // The attach is recorded as explicit state and surfaces in the
    // TerminalPane toolbar.
    expect(screen.getByText('Attach agent-5')).toBeInTheDocument();

    submitCommand('fix the bug');
    await flush();

    expect(sendCalls()).toHaveLength(1);
    expect(JSON.parse(sendCalls()[0][1].body)).toEqual({
      sessionName: 'agent-5',
      message: 'fix the bug',
    });
  });

  it('`exit` detaches: the attach button disappears and commands run locally again', async () => {
    render(<App />);
    await flush();

    submitCommand('tmux attach -t agent-5');
    await flush();
    expect(screen.getByText('Attach agent-5')).toBeInTheDocument();

    submitCommand('exit');
    await flush();
    expect(screen.queryByText(/Attach agent-5/)).not.toBeInTheDocument();

    mockFetch.mockClear();
    submitCommand('fix the bug');
    await flush();

    expect(sendCalls()).toHaveLength(0);
    expect(executeCalls().length).toBeGreaterThan(0);
  });

  it('attaching to a non-agent tmux session does not enable message routing', async () => {
    render(<App />);
    await flush();

    submitCommand('tmux attach -t myshell');
    await flush();
    // No agent routing and no attach button for a non-agent session name.
    expect(screen.queryByText(/Attach myshell/)).not.toBeInTheDocument();

    submitCommand('fix the bug');
    await flush();
    expect(sendCalls()).toHaveLength(0);
  });
});
