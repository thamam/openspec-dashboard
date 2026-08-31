import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { io, Socket } from 'socket.io-client';
import '@xterm/xterm/css/xterm.css';

interface SessionItem {
  id: string;
  cols: number;
  rows: number;
}

interface Props {
  onExecuteCommand?: (cmd: string) => void;
  terminalHeight?: number;
  // C16: the active agent tmux session is explicit App state (set on
  // `tmux attach -t <agent-N>`), no longer parsed out of the capped
  // terminalLines log — every /api/execute reply ends with an exit marker, so
  // log-based detection always read the session as gone (and the C7 cap could
  // evict the session marker entirely).
  activeAgentSession?: string;
}

export const TerminalPane: React.FC<Props> = ({ onExecuteCommand, terminalHeight, activeAgentSession = '' }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const [activeSession, setActiveSession] = useState<string>('main');
  const activeSessionRef = useRef<string>('main');
  activeSessionRef.current = activeSession;

  const [sessions, setSessions] = useState<SessionItem[]>([{ id: 'main', cols: 100, rows: 30 }]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const [webglActive, setWebglActive] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(13);

  // Search state
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [caseSensitive, setCaseSensitive] = useState<boolean>(false);
  const [useRegex, setUseRegex] = useState<boolean>(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current) {
      try {
        fitAddonRef.current.fit();
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('terminal-resize', {
            sessionId: activeSessionRef.current,
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows
          });
        }
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize,
      lineHeight: 1.2,
      macOptionIsMeta: true,
      scrollback: 10000,
      allowProposedApi: true,
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
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();
    const unicode11Addon = new Unicode11Addon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(unicode11Addon);
    try {
      term.unicode.activeVersion = '11';
    } catch (e) {}

    term.open(terminalRef.current);
    fitAddon.fit();

    // Try WebGL renderer acceleration
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
        setWebglActive(false);
      });
      term.loadAddon(webglAddon);
      setWebglActive(true);
    } catch (e) {
      setWebglActive(false);
    }

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Attach custom keyboard handler for Cmd+C, Cmd+V, Cmd+K, Cmd+F
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true;

      // Cmd+C / Ctrl+C
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyC') {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection());
          return false;
        }
        return true; // Pass through SIGINT
      }

      // Cmd+V / Ctrl+V
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyV') {
        navigator.clipboard.readText().then(text => {
          if (text && socketRef.current) {
            socketRef.current.emit('terminal-input', {
              sessionId: activeSessionRef.current,
              data: text
            });
          }
        }).catch(() => {});
        return false;
      }

      // Cmd+K / Ctrl+K (Clear screen)
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') {
        term.clear();
        if (socketRef.current) {
          socketRef.current.emit('terminal-input', {
            sessionId: activeSessionRef.current,
            data: 'clear\r'
          });
        }
        return false;
      }

      // Cmd+F / Ctrl+F (Find in scrollback)
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyF') {
        setShowSearch(prev => !prev);
        return false;
      }

      return true;
    });

    // Socket Connection Setup
    const serverUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:3011'
      : window.location.origin;

    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnectionStatus('connected');
      socket.emit('terminal-init', {
        sessionId: activeSessionRef.current,
        cols: term.cols,
        rows: term.rows
      });
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.io.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    socket.on('terminal-init-ack', (res: { sessionId: string; sessions: SessionItem[] }) => {
      if (res.sessions) {
        setSessions(res.sessions);
      }
    });

    socket.on('terminal-sessions-updated', (list: SessionItem[]) => {
      if (list) {
        setSessions(list);
      }
    });

    socket.on('terminal-history', (payload: { sessionId: string; data: string }) => {
      if (payload.sessionId === activeSessionRef.current) {
        term.write(payload.data);
      }
    });

    socket.on('terminal-data', (payload: { sessionId: string; data: string } | string) => {
      if (typeof payload === 'string') {
        term.write(payload);
      } else if (payload.sessionId === activeSessionRef.current) {
        term.write(payload.data);
      }
    });

    term.onData((data: string) => {
      if (socket.connected) {
        socket.emit('terminal-input', {
          sessionId: activeSessionRef.current,
          data
        });
      }
    });

    term.onResize((size) => {
      if (socket.connected) {
        socket.emit('terminal-resize', {
          sessionId: activeSessionRef.current,
          cols: size.cols,
          rows: size.rows
        });
      }
    });

    // Attach ResizeObserver to container element for responsive auto-fitting with fallback
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      try {
        resizeObserver = new ResizeObserver(() => {
          fitTerminal();
        });
        if (terminalRef.current) {
          resizeObserver.observe(terminalRef.current);
        }
      } catch (e) {}
    }

    const handleWindowResize = () => {
      fitTerminal();
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (resizeObserver) {
        try {
          resizeObserver.disconnect();
        } catch (e) {}
      }
      window.removeEventListener('resize', handleWindowResize);
      socket.disconnect();
      term.dispose();
    };
  }, []);

  // Sync font size updates to xterm instance
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      fitTerminal();
    }
  }, [fontSize, fitTerminal]);

  // Refit terminal when height updates via drag resizer
  useEffect(() => {
    const timer = setTimeout(() => {
      fitTerminal();
    }, 50);
    return () => clearTimeout(timer);
  }, [terminalHeight, fitTerminal]);

  // Focus search input when search bar opens
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  const handleSwitchSession = (sessionId: string) => {
    if (sessionId === activeSession) return;
    setActiveSession(sessionId);
    activeSessionRef.current = sessionId;

    if (xtermRef.current) {
      xtermRef.current.clear();
    }

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('terminal-init', {
        sessionId,
        cols: xtermRef.current?.cols || 100,
        rows: xtermRef.current?.rows || 30
      });
    }
  };

  // C9: monotonic counter for new-session ids. Deriving the id from
  // `sessions.length + 1` collided with an existing tab after any close; the
  // old prev.some guard blocked the duplicate state entry but the
  // terminal-create-session emit and the session switch still fired for the
  // colliding id.
  const sessionCounterRef = useRef(1);

  const handleCreateSession = () => {
    const newSessionId = `session-${++sessionCounterRef.current}`;
    setSessions(prev => [...prev, { id: newSessionId, cols: 100, rows: 30 }]);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('terminal-create-session', {
        sessionId: newSessionId,
        cols: xtermRef.current?.cols || 100,
        rows: xtermRef.current?.rows || 30
      });
    }
    handleSwitchSession(newSessionId);
  };

  const handleCloseSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (sessions.length <= 1) return; // Keep at least one active session

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('terminal-close-session', { sessionId });
    }

    const remaining = sessions.filter(s => s.id !== sessionId);
    setSessions(remaining);

    if (activeSession === sessionId && remaining.length > 0) {
      handleSwitchSession(remaining[0].id);
    }
  };

  const [inputVal, setInputVal] = useState('');

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();
    if (!trimmed) return;

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('terminal-input', {
        sessionId: activeSession,
        data: `${trimmed}\r`
      });
    } else if (onExecuteCommand) {
      onExecuteCommand(trimmed);
    }
    setInputVal('');
  };

  const handleAttachTmux = () => {
    if (!activeAgentSession) return;
    const cmd = `tmux attach -t ${activeAgentSession}`;
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('terminal-input', {
        sessionId: activeSession,
        data: `${cmd}\r`
      });
    } else if (onExecuteCommand) {
      onExecuteCommand(cmd);
    }
  };

  const handleClear = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('terminal-input', {
        sessionId: activeSession,
        data: 'clear\r'
      });
    }
  };

  const handleOpenITerm = () => {
    const cmd = activeAgentSession ? `tmux attach -t ${activeAgentSession}` : 'zsh';
    fetch('/api/open-terminal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    });
  };

  const handleSearchNext = () => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery, { caseSensitive, regex: useRegex });
    }
  };

  const handleSearchPrev = () => {
    if (searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findPrevious(searchQuery, { caseSensitive, regex: useRegex });
    }
  };

  return (
    <div className="terminal-pane" id="terminal-pane" style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0d1117', position: 'relative' }}>
      {/* iTerm2 Style Session Tab Bar */}
      <div className="terminal-tabbar" style={{ display: 'flex', alignItems: 'center', backgroundColor: '#161b22', borderBottom: '1px solid #30363d', overflowX: 'auto', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', gap: '6px', borderRight: '1px solid #30363d' }}>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: connectionStatus === 'connected' ? '#238636' : connectionStatus === 'reconnecting' ? '#d29922' : '#da3633',
              display: 'inline-block'
            }}
            title={`Status: ${connectionStatus}`}
          />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#8b949e', textTransform: 'capitalize' }}>
            {connectionStatus}
          </span>
        </div>

        {/* Sessions Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', flex: 1, overflowX: 'auto' }}>
          {sessions.map((sess) => {
            const isActive = sess.id === activeSession;
            return (
              <div
                key={sess.id}
                onClick={() => handleSwitchSession(sess.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontFamily: 'monospace',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#f0f6fc' : '#8b949e',
                  backgroundColor: isActive ? '#0d1117' : 'transparent',
                  borderRight: '1px solid #30363d',
                  borderTop: isActive ? '2px solid #58a6ff' : '2px solid transparent',
                  cursor: 'pointer'
                }}
              >
                <span>{sess.id === 'main' ? 'Main Shell' : sess.id}</span>
                {sessions.length > 1 && (
                  <span
                    onClick={(e) => handleCloseSession(e, sess.id)}
                    style={{ color: '#8b949e', fontSize: '12px', fontWeight: 'bold', marginLeft: '4px', cursor: 'pointer' }}
                    title="Close session"
                  >
                    ×
                  </span>
                )}
              </div>
            );
          })}
          <button
            onClick={handleCreateSession}
            style={{ padding: '4px 8px', margin: '0 4px', fontSize: '12px', backgroundColor: 'transparent', color: '#8b949e', border: 'none', cursor: 'pointer' }}
            title="Create New Terminal Session"
          >
            +
          </button>
        </div>

        {/* Toolbar Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px' }}>
          {webglActive && (
            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '10px', backgroundColor: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)', fontWeight: 600 }}>
              GPU Accel
            </span>
          )}

          <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#21262d', borderRadius: '4px', border: '1px solid #30363d' }}>
            <button
              onClick={() => setFontSize(prev => Math.max(9, prev - 1))}
              style={{ padding: '2px 6px', fontSize: '11px', background: 'transparent', color: '#c9d1d9', border: 'none', cursor: 'pointer' }}
              title="Decrease Font Size"
            >
              A-
            </button>
            <span style={{ fontSize: '10px', color: '#8b949e', padding: '0 2px' }}>{fontSize}px</span>
            <button
              onClick={() => setFontSize(prev => Math.min(24, prev + 1))}
              style={{ padding: '2px 6px', fontSize: '11px', background: 'transparent', color: '#c9d1d9', border: 'none', cursor: 'pointer' }}
              title="Increase Font Size"
            >
              A+
            </button>
          </div>

          <button
            onClick={() => setShowSearch(prev => !prev)}
            style={{ padding: '3px 8px', fontSize: '11px', backgroundColor: showSearch ? '#1f6feb' : '#21262d', color: showSearch ? '#fff' : '#c9d1d9', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer' }}
            title="Search Scrollback (Cmd+F)"
          >
            Search
          </button>

          {activeAgentSession && (
            <button
              onClick={handleAttachTmux}
              style={{ padding: '3px 8px', fontSize: '11px', fontWeight: 600, backgroundColor: '#10b981', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Attach {activeAgentSession}
            </button>
          )}

          <button
            onClick={handleClear}
            style={{ padding: '3px 8px', fontSize: '11px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer' }}
            title="Clear Terminal Screen (Cmd+K)"
          >
            Clear
          </button>

          <button
            onClick={handleOpenITerm}
            style={{ padding: '3px 8px', fontSize: '11px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer' }}
          >
            iTerm2
          </button>
        </div>
      </div>

      {/* Interactive iTerm2 Search Bar */}
      {showSearch && (
        <div className="terminal-search-bar" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', backgroundColor: '#161b22', borderBottom: '1px solid #30363d', zIndex: 5 }}>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (searchAddonRef.current) {
                searchAddonRef.current.findNext(e.target.value, { caseSensitive, regex: useRegex });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey) handleSearchPrev();
                else handleSearchNext();
              } else if (e.key === 'Escape') {
                setShowSearch(false);
              }
            }}
            placeholder="Search terminal output... (Enter for next, Shift+Enter for prev)"
            style={{ flex: 1, backgroundColor: '#0d1117', border: '1px solid #30363d', borderRadius: '4px', color: '#f0f6fc', padding: '4px 8px', fontSize: '12px', outline: 'none' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#8b949e', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
            />
            Match Case
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#8b949e', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useRegex}
              onChange={(e) => setUseRegex(e.target.checked)}
            />
            Regex
          </label>
          <button
            onClick={handleSearchPrev}
            style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer' }}
          >
            Prev
          </button>
          <button
            onClick={handleSearchNext}
            style={{ padding: '2px 8px', fontSize: '11px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '4px', cursor: 'pointer' }}
          >
            Next
          </button>
          <button
            onClick={() => setShowSearch(false)}
            style={{ background: 'transparent', border: 'none', color: '#8b949e', fontSize: '14px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Main XTerm Rendering Canvas Container */}
      <div ref={terminalRef} style={{ flex: 1, padding: '4px', overflow: 'hidden' }} />

      {/* Bottom Command Runner Input */}
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

