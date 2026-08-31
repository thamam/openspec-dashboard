import pty from 'node-pty';
import { Server, Socket } from 'socket.io';
import os from 'os';

const MAX_BUFFER_CHARS = 100000;

// S7: hard cap on concurrent PTY sessions (resource-exhaustion guard).
export const MAX_SESSIONS = 10;
// S7: a session whose last subscriber left is reaped after this grace period
// (long enough to survive a socket reconnect); 'main' is exempt.
export const REAP_GRACE_MS = 30_000;

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
  private reapTimers: Map<string, NodeJS.Timeout> = new Map();
  private idCounter = 0;

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

  // L3: Date.now() alone collides within the same millisecond; the counter
  // suffix makes auto ids unique. Clients pass explicit ids (lowest-free
  // session-N from the live list, see cycle 14) so the schemes never fight.
  private nextSessionId(): string {
    return `session-${Date.now()}-${++this.idCounter}`;
  }

  private cancelReap(sessionId: string) {
    const timer = this.reapTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.reapTimers.delete(sessionId);
    }
  }

  // S7: schedule a reap once a session loses its last subscriber. The grace
  // period lets a reconnecting socket resubscribe first (cancelReap).
  private maybeReap(session: PtySession) {
    if (session.id === 'main' || session.subscribers.size > 0) return;
    this.cancelReap(session.id);
    const timer = setTimeout(() => {
      this.reapTimers.delete(session.id);
      // Re-verify at fire time: a resubscribe cancels the timer, and a
      // same-id session created after this one closed must not be killed.
      const current = this.sessions.get(session.id);
      if (current === session && current.subscribers.size === 0) {
        this.closeSession(session.id);
        this.io.emit('terminal-sessions-updated', this.getAllSessionsInfo());
      }
    }, REAP_GRACE_MS);
    if (typeof timer.unref === 'function') timer.unref();
    this.reapTimers.set(session.id, timer);
  }

  public createSession(id?: string, cols = 100, rows = 30, cwd?: string): PtySession {
    const sessionId = id || this.nextSessionId();
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    const session = new PtySession(sessionId, cols, rows, cwd);
    this.sessions.set(sessionId, session);

    session.ptyProcess.onData((data: string) => {
      session.appendBuffer(data);
      for (const socketId of session.subscribers) {
        // L3: the legacy string-format 'terminal-data-legacy' emit was dropped —
        // no client listener exists and it doubled terminal traffic.
        this.io.to(socketId).emit('terminal-data', { sessionId, data });
      }
    });

    session.ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
      for (const socketId of session.subscribers) {
        this.io.to(socketId).emit('terminal-exit', { sessionId, exitCode, signal });
      }
      this.cancelReap(sessionId);
      // Identity check: a same-id session recreated after this one was closed
      // must not be evicted by this stale exit event; an explicit close also
      // lands here (closeSession deletes before kill resolves) and must not
      // double-broadcast.
      if (this.sessions.get(sessionId) !== session) return;
      this.sessions.delete(sessionId);
      // 'main' is the permanent default shell: a natural exit (the user typed
      // `exit`, the shell crashed) restarts it so the broadcast list every
      // client receives still contains the one guaranteed session. Explicit
      // closes go through closeSession and are NOT resurrected. The restart
      // is budgeted: a shell that exits instantly (broken rc, bad SHELL)
      // would otherwise loop spawn → exit → broadcast forever.
      if (sessionId === 'main') {
        this.mainExitTimes.push(Date.now());
        if (this.mainRestartAllowed()) {
          try {
            this.createSession('main');
          } catch (e) {
            console.error('Failed to restart the main session after exit:', e);
          }
        } else {
          console.error('Main session exited too many times within a minute; not restarting automatically');
        }
      }
      this.io.emit('terminal-sessions-updated', this.getAllSessionsInfo());
    });

    // S7: a freshly created session has zero subscribers; if the client's
    // terminal-init never arrives (tab closed mid-create, socket drop, or a
    // create-spamming client) it must not live forever — with MAX_SESSIONS
    // that would permanently exhaust the cap. The normal init flow cancels
    // this timer on subscribe.
    this.maybeReap(session);

    return session;
  }

  public closeSession(id: string) {
    const session = this.sessions.get(id);
    if (session) {
      this.cancelReap(id);
      // Detach subscribers BEFORE kill: an explicit close already removed the
      // client tab, so the exit event must not emit terminal-exit to them
      // (a terminal-exit for main would trigger the client's re-init).
      session.subscribers.clear();
      session.kill();
      this.sessions.delete(id);
    }
  }

  // Budget for main restarts: at most 3 exits with recreation per minute,
  // shared by the onExit auto-restart and terminal-init's recreation, so a
  // shell that exits instantly cannot spin an unbounded spawn loop.
  private mainExitTimes: number[] = [];

  private mainRestartAllowed(): boolean {
    const now = Date.now();
    this.mainExitTimes = this.mainExitTimes.filter(t => now - t < 60_000);
    return this.mainExitTimes.length <= 3;
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
          // A main that died in a rapid exit loop stays dead until the
          // restart budget window slides — recreating it here would just
          // re-enter the loop one client-round-trip later.
          if (reqSessionId === 'main' && !this.mainRestartAllowed()) {
            socket.emit('terminal-error', { sessionId: 'main', message: 'Main session is restarting too frequently; try again shortly' });
            return;
          }
          // S7: cap + crash guard — a hostile or buggy client must not spawn
          // unbounded shells or take the server down via a spawn failure.
          if (this.sessions.size >= MAX_SESSIONS) {
            socket.emit('terminal-error', { sessionId: reqSessionId, message: `Session limit reached (${MAX_SESSIONS})` });
            return;
          }
          try {
            session = this.createSession(reqSessionId, payload?.cols || 100, payload?.rows || 30);
          } catch (e) {
            console.error(`Failed to create session ${reqSessionId}:`, e);
            socket.emit('terminal-error', { sessionId: reqSessionId, message: 'Failed to create terminal session' });
            return;
          }
        }

        // Unsubscribe from previous
        const prev = currentSessionId ? this.sessions.get(currentSessionId) : undefined;
        if (prev && prev !== session) {
          prev.subscribers.delete(socket.id);
          this.maybeReap(prev);
        }

        currentSessionId = reqSessionId;
        this.socketSessionMap.set(socket.id, currentSessionId);
        session.subscribers.add(socket.id);
        this.cancelReap(session.id);

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

      socket.on('terminal-input', (payload: string | { sessionId?: string; data?: string } | null) => {
        const isObj = payload !== null && typeof payload === 'object';
        const targetSessionId = isObj && payload.sessionId ? payload.sessionId : currentSessionId;
        const inputData = isObj ? payload.data : payload;

        // L3: an object payload without `data` used to call write(undefined).
        if (typeof inputData !== 'string') return;

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
        const newId = payload?.sessionId || this.nextSessionId();
        if (!this.sessions.has(newId)) {
          // S7: cap + crash guard (same reasoning as terminal-init).
          if (this.sessions.size >= MAX_SESSIONS) {
            socket.emit('terminal-error', { sessionId: newId, message: `Session limit reached (${MAX_SESSIONS})` });
            return;
          }
          try {
            this.createSession(newId, payload?.cols || 100, payload?.rows || 30);
          } catch (e) {
            console.error(`Failed to create session ${newId}:`, e);
            socket.emit('terminal-error', { sessionId: newId, message: 'Failed to create terminal session' });
            return;
          }
        }

        // Notify all clients of new session
        this.io.emit('terminal-sessions-updated', this.getAllSessionsInfo());

        socket.emit('terminal-session-created', { sessionId: newId });
      });

      socket.on('terminal-close-session', (payload: { sessionId: string }) => {
        if (payload.sessionId) {
          this.closeSession(payload.sessionId);
          this.io.emit('terminal-sessions-updated', this.getAllSessionsInfo());
        }
      });

      socket.on('execute-command', (payload: string | { sessionId?: string; command?: string } | null) => {
        const isObj = payload !== null && typeof payload === 'object';
        const targetSessionId = isObj && payload.sessionId ? payload.sessionId : currentSessionId;
        const cmd = isObj ? payload.command : payload;
        if (typeof cmd !== 'string') return;
        const session = this.sessions.get(targetSessionId);
        if (session) {
          session.ptyProcess.write(`${cmd}\r`);
        }
      });

      socket.on('disconnect', () => {
        const prev = currentSessionId ? this.sessions.get(currentSessionId) : undefined;
        if (prev) {
          prev.subscribers.delete(socket.id);
          this.maybeReap(prev);
        }
        this.socketSessionMap.delete(socket.id);
      });
    });
  }
}

