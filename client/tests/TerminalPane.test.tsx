import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
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
});
