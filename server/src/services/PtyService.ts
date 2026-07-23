import pty from 'node-pty';
import { Server, Socket } from 'socket.io';
import os from 'os';

const MAX_BUFFER_CHARS = 100000;

export interface SessionInfo {
  id: string;
  cols: number;
  rows: number;
}

export class PtySession {
  public id: string;
  public ptyProcess: pty.IPty;
  public buffer: string = '';
  public subscribers: Set<string> = new Set();
  public cols: number = 100;
  public rows: number = 30;

  constructor(id: string, cols = 100, rows = 30, cwd?: string) {
    this.id = id;
    this.cols = cols;
    this.rows = rows;

    const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');
    const targetCwd = cwd || process.env.REPO_PATH || process.cwd();

    try {
      this.ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: targetCwd,
        env: {
          ...(process.env as { [key: string]: string }),
          COLORTERM: 'truecolor',
          TERM: 'xterm-256color'
        }
      });
    } catch (e) {
      console.error(`Failed to spawn PTY session ${id} with shell:`, shell, e);
      const fallbackShell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/sh';
      this.ptyProcess = pty.spawn(fallbackShell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: targetCwd,
        env: {
          ...(process.env as { [key: string]: string }),
          COLORTERM: 'truecolor',
          TERM: 'xterm-256color'
        }
      });
    }
  }

  public appendBuffer(data: string) {
    this.buffer += data;
    if (this.buffer.length > MAX_BUFFER_CHARS) {
      this.buffer = this.buffer.slice(this.buffer.length - MAX_BUFFER_CHARS);
    }
  }

  public resize(cols: number, rows: number) {
    if (cols > 0 && rows > 0) {
      this.cols = cols;
      this.rows = rows;
      try {
        this.ptyProcess.resize(cols, rows);
      } catch (e) {
        console.error(`Error resizing session ${this.id}:`, e);
      }
    }
  }

  public kill() {
    try {
      this.ptyProcess.kill();
    } catch (e) {}
  }
}

export class PtyService {
  private io: Server;
  private sessions: Map<string, PtySession> = new Map();
  private socketSessionMap: Map<string, string> = new Map();

  constructor(io: Server) {
    this.io = io;
  }

  public getSession(id: string): PtySession | undefined {
    return this.sessions.get(id);
  }

  public getAllSessionsInfo(): SessionInfo[] {
    const list: SessionInfo[] = [];
    for (const [id, session] of this.sessions.entries()) {
      list.push({ id, cols: session.cols, rows: session.rows });
    }
    return list;
  }

  public createSession(id?: string, cols = 100, rows = 30, cwd?: string): PtySession {
    const sessionId = id || `session-${Date.now()}`;
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    const session = new PtySession(sessionId, cols, rows, cwd);
    this.sessions.set(sessionId, session);

    session.ptyProcess.onData((data: string) => {
      session.appendBuffer(data);
      for (const socketId of session.subscribers) {
        this.io.to(socketId).emit('terminal-data', { sessionId, data });
        // Legacy string format fallback
        this.io.to(socketId).emit('terminal-data-legacy', data);
      }
    });

    session.ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      for (const socketId of session.subscribers) {
        this.io.to(socketId).emit('terminal-exit', { sessionId, exitCode, signal });
      }
      this.sessions.delete(sessionId);
    });

    return session;
  }

  public closeSession(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.kill();
      this.sessions.delete(id);
    }
  }

  public init() {
    // Always ensure at least a default 'main' session exists
    if (this.sessions.size === 0) {
      this.createSession('main');
    }

    this.io.on('connection', (socket: Socket) => {
      // Default auto-attach to 'main' session if none specified
      let currentSessionId = 'main';

      socket.on('terminal-init', (payload?: { sessionId?: string; cols?: number; rows?: number }) => {
        const reqSessionId = payload?.sessionId || 'main';
        let session = this.sessions.get(reqSessionId);
        if (!session) {
          session = this.createSession(reqSessionId, payload?.cols || 100, payload?.rows || 30);
        }

        // Unsubscribe from previous
        if (currentSessionId && this.sessions.has(currentSessionId)) {
          this.sessions.get(currentSessionId)?.subscribers.delete(socket.id);
        }

        currentSessionId = reqSessionId;
        this.socketSessionMap.set(socket.id, currentSessionId);
        session.subscribers.add(socket.id);

        if (payload?.cols && payload?.rows) {
          session.resize(payload.cols, payload.rows);
        }

        socket.emit('terminal-init-ack', {
          sessionId: currentSessionId,
          sessions: this.getAllSessionsInfo()
        });

        // Replay history buffer to reconnecting client
        if (session.buffer) {
          socket.emit('terminal-history', { sessionId: currentSessionId, data: session.buffer });
        }
      });

      socket.on('terminal-input', (payload: string | { sessionId?: string; data: string }) => {
        const targetSessionId = typeof payload === 'object' && payload.sessionId ? payload.sessionId : currentSessionId;
        const inputData = typeof payload === 'object' ? payload.data : payload;

        const session = this.sessions.get(targetSessionId);
        if (session) {
          session.ptyProcess.write(inputData);
        }
      });

      socket.on('terminal-resize', (size: { cols: number; rows: number; sessionId?: string }) => {
        const targetSessionId = size.sessionId || currentSessionId;
        const session = this.sessions.get(targetSessionId);
        if (session && size.cols > 0 && size.rows > 0) {
          session.resize(size.cols, size.rows);
        }
      });

      socket.on('terminal-create-session', (payload?: { sessionId?: string; cols?: number; rows?: number }) => {
        const newId = payload?.sessionId || `session-${Date.now()}`;
        const session = this.createSession(newId, payload?.cols || 100, payload?.rows || 30);
        
        // Notify all clients of new session
        this.io.emit('terminal-sessions-updated', this.getAllSessionsInfo());

        socket.emit('terminal-session-created', { sessionId: session.id });
      });

      socket.on('terminal-close-session', (payload: { sessionId: string }) => {
        if (payload.sessionId) {
          this.closeSession(payload.sessionId);
          this.io.emit('terminal-sessions-updated', this.getAllSessionsInfo());
        }
      });

      socket.on('execute-command', (payload: string | { sessionId?: string; command: string }) => {
        const targetSessionId = typeof payload === 'object' && payload.sessionId ? payload.sessionId : currentSessionId;
        const cmd = typeof payload === 'object' ? payload.command : payload;
        const session = this.sessions.get(targetSessionId);
        if (session) {
          session.ptyProcess.write(`${cmd}\r`);
        }
      });

      socket.on('disconnect', () => {
        if (currentSessionId && this.sessions.has(currentSessionId)) {
          this.sessions.get(currentSessionId)?.subscribers.delete(socket.id);
        }
        this.socketSessionMap.delete(socket.id);
      });
    });
  }
}

