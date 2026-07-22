import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

interface Props {
  lines?: string[];
  onExecuteCommand?: (cmd: string) => void;
  terminalHeight?: number;
}

export const TerminalPane: React.FC<Props> = ({ lines = [], onExecuteCommand, terminalHeight }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [activeSession, setActiveSession] = useState<string>('');

  // Detect active agent tmux session from recent logs
  useEffect(() => {
    let sessionName = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      const match = lines[i].match(/(openspec-session-[0-9]+|agent-[0-9]+)/);
      if (match) {
        let exited = false;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].includes('[Process exited with code')) {
            exited = true;
            break;
          }
        }
        if (!exited) {
          sessionName = match[0];
        }
        break;
      }
    }
    setActiveSession(sessionName);
  }, [lines]);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#1f6feb',
        black: '#484f58',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc'
      }
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect Socket.IO PTY stream using IPv4 127.0.0.1 to avoid Node v22 ECONNREFUSED
    const serverUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:3011'
      : window.location.origin;

    const socket = io(serverUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        socket.emit('terminal-resize', {
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows
        });
      }
    });

    socket.on('terminal-data', (data: string) => {
      term.write(data);
    });

    term.onData((data: string) => {
      socket.emit('terminal-input', data);
    });

    term.onResize((size) => {
      socket.emit('terminal-resize', { cols: size.cols, rows: size.rows });
    });

    const handleResize = () => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch (e) {}
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      socket.disconnect();
      term.dispose();
    };
  }, []);

  // Refit terminal when height updates via drag resizer
  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
        } catch (e) {}
      }, 50);
    }
  }, [terminalHeight]);

  const [inputVal, setInputVal] = useState('');

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('terminal-input', `${trimmed}\r`);
    } else if (onExecuteCommand) {
      onExecuteCommand(trimmed);
    }
    setInputVal('');
  };

  const handleAttachTmux = () => {
    if (!activeSession) return;
    const cmd = `tmux attach -t ${activeSession}`;
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('terminal-input', `${cmd}\r`);
    } else if (onExecuteCommand) {
      onExecuteCommand(cmd);
    }
  };

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('terminal-input', 'clear\r');
    }
  };

  const handleOpenITerm = () => {
    const cmd = activeSession ? `tmux attach -t ${activeSession}` : 'zsh';
    fetch('/api/open-terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    });
  };

  return (
    <div className="terminal-pane" id="terminal-pane" style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0d1117' }}>
      <div className="terminal-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', backgroundColor: '#161b22', borderBottom: '1px solid #30363d' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#238636', display: 'inline-block' }}></span>
          <span style={{ color: '#c9d1d9', fontWeight: 600, fontSize: '12px', fontFamily: 'monospace' }}>
            iTerm Interactive Shell {activeSession ? `[Active: ${activeSession}]` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {activeSession && (
            <button
              onClick={handleAttachTmux}
              style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 600, backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Attach to {activeSession}
            </button>
          )}
          <button
            onClick={handleClear}
            style={{ padding: '3px 8px', fontSize: '11px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer' }}
          >
            Clear
          </button>
          <button
            onClick={handleOpenITerm}
            style={{ padding: '3px 8px', fontSize: '11px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer' }}
          >
            Open in iTerm2 / Terminal.app
          </button>
        </div>
      </div>
      <div ref={terminalRef} style={{ flex: 1, padding: '4px', overflow: 'hidden' }} />
      <form onSubmit={handlePromptSubmit} style={{ display: 'flex', alignItems: 'center', padding: '6px 12px', backgroundColor: '#161b22', borderTop: '1px solid #30363d', gap: '8px' }}>
        <span style={{ color: '#3fb950', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '12px' }}>$</span>
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Type command or input here and press Enter..."
          style={{ flex: 1, background: 'transparent', border: 'none', color: '#f0f6fc', fontFamily: 'monospace', fontSize: '12px', outline: 'none' }}
        />
        <button type="submit" style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 600, backgroundColor: '#238636', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Run
        </button>
      </form>
    </div>
  );
};
