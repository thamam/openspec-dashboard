import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import App from '../src/App.js';

// C16 regression tests: the App-level agent-session layer was REMOVED. In the
// PTY architecture the only path into `handleRunTerminalCommand` is
// TerminalPane's socket-disconnected fallback, so the /api/send-message
// routing branch could never run in production; and real agent session names
// (`agent-<changeName>`, `agent-task-<timestamp>`) never matched the old
// numeric detection pattern. Attaching to an agent session is done by typing
// `tmux attach` in the PTY itself. These tests pin the removal: prompt
// commands always execute via /api/execute, no Attach button exists, and
// `clear` is a client-side no-op (the server allowlists a `clear` binary —
// spawning it into the void would be pointless).

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

function callsTo(url: string) {
  return mockFetch.mock.calls.filter((call) => call[0] === url);
}

describe('App terminal prompt (C16 removal)', () => {
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

  it('never routes prompt commands to /api/send-message — everything executes locally', async () => {
    render(<App />);
    await flush();

    submitCommand('tmux attach -t agent-5');
    await flush();
    submitCommand('fix the bug');
    await flush();

    expect(callsTo('/api/send-message')).toHaveLength(0);
    // Both commands went to /api/execute (attach included — no special case).
    expect(callsTo('/api/execute')).toHaveLength(2);
    // No attach affordance remains.
    expect(screen.queryByText(/^Attach /)).not.toBeInTheDocument();
  });

  it('`clear` is a client-side no-op (no /api/execute spawn)', async () => {
    render(<App />);
    await flush();
    mockFetch.mockClear();

    submitCommand('clear');
    await flush();

    expect(callsTo('/api/execute')).toHaveLength(0);
  });
});
