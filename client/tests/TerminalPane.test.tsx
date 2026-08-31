import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import React from 'react';
import { io } from 'socket.io-client';
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

describe('TerminalPane Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  // C9: ids derived from sessions.length collide after a close — the old
  // prev.some guard blocked the duplicate state entry but the create emit and
  // the session switch still fired for the colliding id.
  it('C9: generates monotonic session ids that never collide after closes', () => {
    render(<TerminalPane />);
    const newTabBtn = screen.getByTitle('Create New Terminal Session');

    fireEvent.click(newTabBtn); // session-2
    fireEvent.click(newTabBtn); // session-3
    expect(screen.getByText('session-2')).toBeInTheDocument();
    expect(screen.getByText('session-3')).toBeInTheDocument();

    // Close session-2: sessions.length drops to 2 (main + session-3), so a
    // length-derived id would be `session-3` — an existing tab.
    const session2Tab = screen.getByText('session-2').parentElement!;
    fireEvent.click(within(session2Tab).getByTitle('Close session'));
    expect(screen.queryByText('session-2')).not.toBeInTheDocument();

    fireEvent.click(newTabBtn);
    // The new tab must be a fresh id, not the existing session-3.
    expect(screen.getByText('session-4')).toBeInTheDocument();
    expect(screen.getAllByText('session-3')).toHaveLength(1);
  });

  it('C9: never emits terminal-create-session for an id that already exists', () => {
    render(<TerminalPane />);
    // The io() mock returns one shared socket object; the component grabbed it
    // during render.
    const emitMock = vi.mocked(io).mock.results[0].value.emit;
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
    // Must not target the still-existing session-3.
    expect(createCalls[0][1].sessionId).not.toBe('session-3');
    expect(createCalls[0][1].sessionId).toBe('session-4');
  });

  // C16: the active agent session is explicit App state passed as a prop —
  // parsing it out of the capped `lines` log was dead (every /api/execute
  // reply ends with an exit marker, so detection always read "exited").
  it('C16: shows the attach button from the activeAgentSession prop', () => {
    render(<TerminalPane activeAgentSession="agent-5" />);
    expect(screen.getByText('Attach agent-5')).toBeInTheDocument();
  });

  it('C16: does not derive an agent session from log lines (log parsing removed)', () => {
    // `lines` is no longer a declared prop — pass it as a legacy caller would
    // (untyped spread) to prove the content is ignored either way.
    const legacyProps = { lines: ['$ run workflow', 'started agent-9'] };
    render(<TerminalPane {...legacyProps} />);
    expect(screen.queryByText(/Attach agent-9/)).not.toBeInTheDocument();
  });
});
