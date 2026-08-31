import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { io } from 'socket.io-client';
import { Terminal } from '@xterm/xterm';
import { TerminalPane } from '../src/components/TerminalPane';

// Mock xterm and addons
vi.mock('@xterm/xterm', () => {
  return {
    Terminal: vi.fn().mockImplementation(() => ({
      loadAddon: vi.fn(),
      open: vi.fn(),
      write: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
      onData: vi.fn(),
      onResize: vi.fn(),
      attachCustomKeyEventHandler: vi.fn(),
      unicode: { activeVersion: '11' },
      options: { fontSize: 13 },
      cols: 80,
      rows: 24,
      hasSelection: vi.fn().mockReturnValue(false),
      getSelection: vi.fn().mockReturnValue('')
    }))
  };
});

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    dispose: vi.fn()
  }))
}));

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: vi.fn().mockImplementation(() => ({
    onContextLoss: vi.fn(),
    dispose: vi.fn()
  }))
}));

vi.mock('@xterm/addon-search', () => ({
  SearchAddon: vi.fn().mockImplementation(() => ({
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    dispose: vi.fn()
  }))
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({
    dispose: vi.fn()
  }))
}));

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: vi.fn().mockImplementation(() => ({
    dispose: vi.fn()
  }))
}));

vi.mock('socket.io-client', () => ({
  io: vi.fn().mockReturnValue({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
    io: { on: vi.fn() }
  })
}));

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

// The io() mock returns one shared socket object per render; the component
// registers its handlers on it.
function socketOf(index = 0) {
  return vi.mocked(io).mock.results[index].value;
}

// Drive the server-pushed session list (terminal-init-ack), as happens on
// (re)connect when the server's PtyService already has sessions alive.
function pushServerSessions(index: number, sessions: { id: string; cols: number; rows: number }[]) {
  const onMock = socketOf(index).on;
  const handler = onMock.mock.calls.find((c: unknown[]) => c[0] === 'terminal-init-ack')?.[1];
  expect(handler, 'terminal-init-ack handler registered').toBeTruthy();
  act(() => handler({ sessionId: 'main', sessions }));
}

// Drive any server-pushed socket event (terminal-exit, terminal-error, ...).
function pushSocketEvent(index: number, event: string, payload: unknown) {
  const onMock = socketOf(index).on;
  const handler = onMock.mock.calls.find((c: unknown[]) => c[0] === event)?.[1];
  expect(handler, `${event} handler registered`).toBeTruthy();
  act(() => handler(payload));
}

describe('TerminalPane Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  it('renders terminal session tabs and control toolbar', () => {
    render(<TerminalPane />);

    expect(screen.getByText('Main Shell')).toBeInTheDocument();
    expect(screen.getByText('GPU Accel')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
    expect(screen.getByText('iTerm2')).toBeInTheDocument();
  });

  it('toggles interactive search bar on clicking Search button', () => {
    render(<TerminalPane />);

    const searchBtn = screen.getByText('Search');
    fireEvent.click(searchBtn);

    expect(screen.getByPlaceholderText(/Search terminal output/i)).toBeInTheDocument();
    expect(screen.getByText('Match Case')).toBeInTheDocument();
    expect(screen.getByText('Regex')).toBeInTheDocument();

    const closeSearchBtn = screen.getByText('×');
    fireEvent.click(closeSearchBtn);
    expect(screen.queryByPlaceholderText(/Search terminal output/i)).not.toBeInTheDocument();
  });

  it('adjusts font size using A+ and A- buttons', () => {
    render(<TerminalPane />);

    expect(screen.getByText('13px')).toBeInTheDocument();

    const fontPlusBtn = screen.getByTitle('Increase Font Size');
    fireEvent.click(fontPlusBtn);

    expect(screen.getByText('14px')).toBeInTheDocument();

    const fontMinusBtn = screen.getByTitle('Decrease Font Size');
    fireEvent.click(fontMinusBtn);

    expect(screen.getByText('13px')).toBeInTheDocument();
  });

  it('creates new session tab on clicking +', () => {
    render(<TerminalPane />);

    const newTabBtn = screen.getByTitle('Create New Terminal Session');
    fireEvent.click(newTabBtn);

    expect(screen.getByText('session-2')).toBeInTheDocument();
  });

  // C9: the session id must never collide with a live session. Two id
  // strategies failed here: sessions.length+1 collides after a close (the old
  // prev.some guard blocked the duplicate state entry but the create emit and
  // the session switch still fired for the colliding id), and a mount-local
  // counter collides after a reload because the server's PtyService sessions
  // survive the page. The id must come from the live sessions list: lowest
  // free session-N.
  it('C9: reuses the lowest free session id after a close, never a live one', () => {
    render(<TerminalPane />);
    const newTabBtn = screen.getByTitle('Create New Terminal Session');

    fireEvent.click(newTabBtn); // session-2
    fireEvent.click(newTabBtn); // session-3
    expect(screen.getByText('session-2')).toBeInTheDocument();
    expect(screen.getByText('session-3')).toBeInTheDocument();

    // Close session-2: the live list is main + session-3.
    const session2Tab = screen.getByText('session-2').parentElement!;
    fireEvent.click(within(session2Tab).getByTitle('Close session'));
    expect(screen.queryByText('session-2')).not.toBeInTheDocument();

    fireEvent.click(newTabBtn);
    // session-2 was closed, so reusing it is safe; the live session-3 must
    // stay unique.
    expect(screen.getAllByText('session-2')).toHaveLength(1);
    expect(screen.getAllByText('session-3')).toHaveLength(1);
  });

  it('C9: never emits terminal-create-session for a live session id', () => {
    render(<TerminalPane />);
    const emitMock = socketOf().emit;
    const newTabBtn = screen.getByTitle('Create New Terminal Session');

    fireEvent.click(newTabBtn); // creates session-2
    fireEvent.click(newTabBtn); // creates session-3

    const session2Tab = screen.getByText('session-2').parentElement!;
    fireEvent.click(within(session2Tab).getByTitle('Close session'));

    emitMock.mockClear();
    fireEvent.click(newTabBtn);

    const createCalls = emitMock.mock.calls.filter(
      (call: unknown[]) => call[0] === 'terminal-create-session'
    );
    expect(createCalls).toHaveLength(1);
    // Must target the closed (free) id, never the live session-3.
    expect(createCalls[0][1].sessionId).toBe('session-2');
  });

  it('C9: a server session list that survives reload is respected (no mount-local counter)', () => {
    render(<TerminalPane />);
    // Server still has sessions from before the page reload.
    pushServerSessions(0, [
      { id: 'main', cols: 100, rows: 30 },
      { id: 'session-2', cols: 100, rows: 30 },
      { id: 'session-3', cols: 100, rows: 30 }
    ]);

    fireEvent.click(screen.getByTitle('Create New Terminal Session'));

    // The new tab must not collide with the server-known sessions.
    expect(screen.getByText('session-4')).toBeInTheDocument();
    expect(screen.getAllByText('session-2')).toHaveLength(1);
    expect(screen.getAllByText('session-3')).toHaveLength(1);
  });

  // C16: the App-level agent-session layer (Attach button, prompt →
  // /api/send-message routing, iTerm2 attach variant) was removed — in the PTY
  // architecture the setter was only reachable with the socket disconnected,
  // and real session names (agent-<changeName>) never matched the detection
  // pattern anyway. Attaching is done by typing `tmux attach` in the PTY.
  it('C16: renders no agent attach button', () => {
    render(<TerminalPane />);
    expect(screen.queryByText(/^Attach /)).not.toBeInTheDocument();
  });

  it('C16: iTerm2 always opens a plain shell', () => {
    render(<TerminalPane />);
    fireEvent.click(screen.getByText('iTerm2'));
    expect(mockFetch).toHaveBeenCalledWith('/api/open-terminal', expect.objectContaining({
      body: JSON.stringify({ command: 'zsh' })
    }));
  });

  // C17: the server deletes a session when its PTY exits (or when the S7
  // reaper collects it) and broadcasts; the client must drop the dead tab.
  it('C17: terminal-exit removes the dead session tab and switches away if active', () => {
    render(<TerminalPane />);
    fireEvent.click(screen.getByTitle('Create New Terminal Session')); // session-2, active
    expect(screen.getByText('session-2')).toBeInTheDocument();

    const emitMock = socketOf(0).emit;
    emitMock.mockClear();
    pushSocketEvent(0, 'terminal-exit', { sessionId: 'session-2', exitCode: 0 });

    expect(screen.queryByText('session-2')).not.toBeInTheDocument();
    // Switched back to the remaining session.
    const switchCalls = emitMock.mock.calls.filter(
      (c: unknown[]) => c[0] === 'terminal-init' && (c[1] as { sessionId: string }).sessionId === 'main'
    );
    expect(switchCalls.length).toBeGreaterThan(0);
  });

  it('C17: terminal-exit of a background session keeps the active tab', () => {
    render(<TerminalPane />);
    fireEvent.click(screen.getByTitle('Create New Terminal Session')); // session-2
    fireEvent.click(screen.getByTitle('Create New Terminal Session')); // session-3, active
    expect(screen.getByText('session-3')).toBeInTheDocument();

    const emitMock = socketOf(0).emit;
    emitMock.mockClear();
    pushSocketEvent(0, 'terminal-exit', { sessionId: 'session-2', exitCode: 0 });

    expect(screen.queryByText('session-2')).not.toBeInTheDocument();
    expect(screen.getByText('session-3')).toBeInTheDocument();
    // No session switch should have been emitted.
    const switchCalls = emitMock.mock.calls.filter((c: unknown[]) => c[0] === 'terminal-init');
    expect(switchCalls).toHaveLength(0);
  });

  // S7: handleCreateSession adds the tab optimistically; when the server
  // rejects the create (session cap) it replies with terminal-error and the
  // client must revert the tab.
  it('S7: terminal-error for a pending create reverts the optimistic tab', () => {
    render(<TerminalPane />);
    fireEvent.click(screen.getByTitle('Create New Terminal Session'));
    expect(screen.getByText('session-2')).toBeInTheDocument();

    pushSocketEvent(0, 'terminal-error', { sessionId: 'session-2', message: 'Session limit reached (10)' });

    expect(screen.queryByText('session-2')).not.toBeInTheDocument();
  });

  it('S7: terminal-error never drops the main tab (tab strip keeps one session)', () => {
    render(<TerminalPane />);
    pushSocketEvent(0, 'terminal-error', { sessionId: 'main', message: 'Failed to create terminal session' });
    expect(screen.getByText('Main Shell')).toBeInTheDocument();
  });

  // When the main restart budget is exhausted the server refuses recreation;
  // the client must surface the refusal and retry once the window has slid,
  // or main stays dead until a page reload.
  it('S7: terminal-error for main surfaces the message and retries init after the budget window', () => {
    vi.useFakeTimers();
    try {
      render(<TerminalPane />);
      const emitMock = socketOf(0).emit;
      emitMock.mockClear();

      pushSocketEvent(0, 'terminal-error', { sessionId: 'main', message: 'Main session is restarting too frequently; try again shortly' });

      expect(screen.getByText('Main Shell')).toBeInTheDocument();
      const termInstance = vi.mocked(Terminal).mock.results[0].value;
      expect(termInstance.write).toHaveBeenCalledWith(expect.stringContaining('restarting too frequently'));

      // No immediate retry...
      expect(emitMock.mock.calls.filter((c: unknown[]) => c[0] === 'terminal-init')).toHaveLength(0);
      // ...but one after the 60s budget window has slid.
      act(() => { vi.advanceTimersByTime(61_000); });
      const retryCalls = emitMock.mock.calls.filter(
        (c: unknown[]) => c[0] === 'terminal-init' && (c[1] as { sessionId: string }).sessionId === 'main'
      );
      expect(retryCalls.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // The real event sequence when the user types `exit` in the main shell:
  // terminal-exit for main, then a terminal-sessions-updated broadcast whose
  // list again contains main (the server restarts it). The tab must survive
  // and the client must resubscribe to the fresh main.
  it('C17: main exit + following broadcast keeps the main tab and resubscribes', () => {
    render(<TerminalPane />);
    const emitMock = socketOf(0).emit;
    emitMock.mockClear();

    pushSocketEvent(0, 'terminal-exit', { sessionId: 'main', exitCode: 0 });
    pushSocketEvent(0, 'terminal-sessions-updated', [{ id: 'main', cols: 100, rows: 30 }]);

    expect(screen.getByText('Main Shell')).toBeInTheDocument();
    const reinitCalls = emitMock.mock.calls.filter(
      (c: unknown[]) => c[0] === 'terminal-init' && (c[1] as { sessionId: string }).sessionId === 'main'
    );
    expect(reinitCalls.length).toBeGreaterThan(0);
  });

  // A stale terminal-exit for main while the user watches another tab must
  // NOT re-init main: terminal-init would move the socket's subscription off
  // the active session, black-holing its output and arming the reaper on it.
  it('C17: main exit while another tab is active does not hijack the subscription', () => {
    render(<TerminalPane />);
    fireEvent.click(screen.getByTitle('Create New Terminal Session')); // session-2, active

    const emitMock = socketOf(0).emit;
    emitMock.mockClear();
    pushSocketEvent(0, 'terminal-exit', { sessionId: 'main', exitCode: 0 });

    const initCalls = emitMock.mock.calls.filter((c: unknown[]) => c[0] === 'terminal-init');
    expect(initCalls).toHaveLength(0);
    // The dead main tab is not resurrected into view either.
    expect(screen.getByText('session-2')).toBeInTheDocument();
  });
});

// C13: session tabs and their × close controls were clickable <div>/<span> —
// no keyboard focus, no role. They are now native sibling <button type="button">
// elements (a button nested in a button would be invalid HTML). Pin the
// semantics: role, type, focusability, keyboard activation.
describe('TerminalPane session tabs (C13 a11y)', () => {
  it('renders the session tab and close control as native buttons', () => {
    render(<TerminalPane />);
    fireEvent.click(screen.getByTitle('Create New Terminal Session')); // session-2

    const mainTab = screen.getByRole('button', { name: 'Main Shell' });
    expect(mainTab).toHaveAttribute('type', 'button');
    const session2Tab = screen.getByRole('button', { name: 'session-2' });
    expect(session2Tab).toHaveAttribute('type', 'button');
    const closeBtn = within(session2Tab.parentElement!).getByTitle('Close session');
    expect(closeBtn.tagName).toBe('BUTTON');
    expect(closeBtn).toHaveAttribute('type', 'button');
    // Accessible name must not be just "×" (text content beats title).
    expect(closeBtn).toHaveAttribute('aria-label', 'Close session session-2');
  });

  it('session tabs switch session on Enter via keyboard focus', async () => {
    render(<TerminalPane />);
    const user = userEvent.setup();
    fireEvent.click(screen.getByTitle('Create New Terminal Session')); // session-2, active

    const emitMock = socketOf(0).emit;
    emitMock.mockClear();

    const mainTab = screen.getByRole('button', { name: 'Main Shell' });
    mainTab.focus();
    expect(mainTab).toHaveFocus();
    await user.keyboard('{Enter}');

    const switchCalls = emitMock.mock.calls.filter(
      (c: unknown[]) => c[0] === 'terminal-init' && (c[1] as { sessionId: string }).sessionId === 'main'
    );
    expect(switchCalls.length).toBeGreaterThan(0);
  });

  it('close control closes its session on Space via keyboard focus', async () => {
    render(<TerminalPane />);
    const user = userEvent.setup();
    fireEvent.click(screen.getByTitle('Create New Terminal Session')); // session-2
    expect(screen.getByText('session-2')).toBeInTheDocument();

    const closeBtn = within(screen.getByText('session-2').parentElement!).getByTitle('Close session');
    closeBtn.focus();
    expect(closeBtn).toHaveFocus();
    await user.keyboard(' ');

    expect(screen.queryByText('session-2')).not.toBeInTheDocument();
  });
});
