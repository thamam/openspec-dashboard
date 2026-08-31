import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pty from 'node-pty';
import { PtyService, PtySession, MAX_SESSIONS, REAP_GRACE_MS } from '../src/services/PtyService.js';
import { Server } from 'socket.io';

// S15 leftover: every PtySession spawns a REAL PTY and the old tests never
// killed the 'main' session created in init() — shells leaked across the run.
// Track every service/session created by a test and kill them all here.
const liveServices: PtyService[] = [];
const liveSessions: PtySession[] = [];

function makeService(mockIo: any): PtyService {
  const svc = new PtyService(mockIo as unknown as Server);
  liveServices.push(svc);
  return svc;
}

function makeSession(...args: ConstructorParameters<typeof PtySession>): PtySession {
  const s = new PtySession(...args);
  liveSessions.push(s);
  return s;
}

afterEach(async () => {
  vi.useRealTimers();

  const pids: number[] = [];
  for (const svc of liveServices) {
    for (const info of svc.getAllSessionsInfo()) {
      const s = svc.getSession(info.id);
      if (s) {
        pids.push(s.ptyProcess.pid);
        // Clear subscribers before kill: the onExit handler emits to them and
        // may fire after restoreAllMocks() below has reset mockIo.to.
        s.subscribers.clear();
      }
      svc.closeSession(info.id);
    }
  }
  for (const s of liveSessions) {
    pids.push(s.ptyProcess.pid);
    s.subscribers.clear();
    s.kill();
  }
  liveServices.length = 0;
  liveSessions.length = 0;

  // Assert no stray PTY processes survive cleanup. SIGHUP (pty.kill) can be
  // ignored by a shell still mid-init when many PTYs are killed at once, so
  // escalate to SIGKILL for anything still alive after a short grace.
  if (pids.length > 0) {
    await new Promise(r => setTimeout(r, 500));
    for (const pid of pids) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
    await vi.waitFor(() => {
      for (const pid of pids) {
        let alive = true;
        try {
          process.kill(pid, 0);
        } catch {
          alive = false;
        }
        expect(alive, `PTY pid ${pid} still alive after test cleanup`).toBe(false);
      }
    }, { timeout: 10000, interval: 50 });
  }

  // Only after the killed PTYs have fired their exit handlers — mockRestore
  // turns vi.fn() implementations into undefined-returning no-ops, which the
  // exit broadcast path would trip over.
  vi.restoreAllMocks();
});

describe('PtyService - Native PTY Stream Handler & Session Pool', () => {
  let mockIo: any;
  let connectionCallback: Function;

  beforeEach(() => {
    mockIo = {
      on: vi.fn((event: string, cb: Function) => {
        if (event === 'connection') {
          connectionCallback = cb;
        }
      }),
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      emit: vi.fn()
    };
  });

  it('should instantiate PtyService cleanly and initialize main session', () => {
    const ptyService = makeService(mockIo);
    expect(ptyService).toBeDefined();

    ptyService.init();
    expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
    expect(ptyService.getSession('main')).toBeDefined();
  });

  it('should create and retrieve custom sessions', () => {
    const ptyService = makeService(mockIo);
    const session = ptyService.createSession('test-session-1', 120, 40);

    expect(session).toBeDefined();
    expect(session.id).toBe('test-session-1');
    expect(session.cols).toBe(120);
    expect(session.rows).toBe(40);

    const retrieved = ptyService.getSession('test-session-1');
    expect(retrieved).toBe(session);

    ptyService.closeSession('test-session-1');
    expect(ptyService.getSession('test-session-1')).toBeUndefined();
  });

  it('should append and bound history buffer in PtySession', () => {
    const session = makeSession('buffer-test', 80, 24);
    session.appendBuffer('Hello World\n');

    expect(session.buffer).toBe('Hello World\n');

    // Test buffer truncation logic
    const longString = 'A'.repeat(120000);
    session.appendBuffer(longString);

    expect(session.buffer.length).toBeLessThanOrEqual(100000);

    session.kill();
  });

  it('should handle client connection and replay history buffer', () => {
    const ptyService = makeService(mockIo);
    ptyService.init();

    const session = ptyService.getSession('main')!;
    session.appendBuffer('Previous output log...\r\n');

    const socketCallbacks: Record<string, Function> = {};
    const mockSocket = {
      id: 'socket-123',
      on: vi.fn((event: string, cb: Function) => {
        socketCallbacks[event] = cb;
      }),
      emit: vi.fn()
    };

    connectionCallback(mockSocket);

    // Client sends terminal-init
    socketCallbacks['terminal-init']({ sessionId: 'main', cols: 110, rows: 35 });

    expect(mockSocket.emit).toHaveBeenCalledWith('terminal-init-ack', expect.objectContaining({
      sessionId: 'main'
    }));

    expect(mockSocket.emit).toHaveBeenCalledWith('terminal-history', {
      sessionId: 'main',
      data: expect.stringContaining('Previous output log...')
    });

    expect(session.cols).toBe(110);
    expect(session.rows).toBe(35);

    // Socket disconnect should un-subscribe but keep session alive
    socketCallbacks['disconnect']();
    expect(ptyService.getSession('main')).toBeDefined();
  });
});

describe('PtyService - S7/L3/C17 lifecycle hardening', () => {
  let mockIo: any;
  let connectionCallback: Function;

  beforeEach(() => {
    mockIo = {
      on: vi.fn((event: string, cb: Function) => {
        if (event === 'connection') {
          connectionCallback = cb;
        }
      }),
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      emit: vi.fn()
    };
  });

  function connectSocket(id: string) {
    const socketCallbacks: Record<string, Function> = {};
    const mockSocket = {
      id,
      on: vi.fn((event: string, cb: Function) => {
        socketCallbacks[event] = cb;
      }),
      emit: vi.fn()
    };
    connectionCallback(mockSocket);
    return { socketCallbacks, mockSocket };
  }

  it(`S7: rejects terminal-create-session beyond the ${MAX_SESSIONS}-session cap`, () => {
    const ptyService = makeService(mockIo);
    ptyService.init(); // 'main' occupies one slot
    const { socketCallbacks, mockSocket } = connectSocket('s-cap');

    for (let i = 0; i < MAX_SESSIONS - 1; i++) {
      socketCallbacks['terminal-create-session']({ sessionId: `cap-${i}` });
    }
    expect(ptyService.getAllSessionsInfo()).toHaveLength(MAX_SESSIONS);

    mockSocket.emit.mockClear();
    mockIo.emit.mockClear();
    socketCallbacks['terminal-create-session']({ sessionId: 'cap-overflow' });

    expect(mockSocket.emit).toHaveBeenCalledWith('terminal-error', expect.objectContaining({
      message: expect.stringContaining('limit')
    }));
    expect(ptyService.getSession('cap-overflow')).toBeUndefined();
    expect(mockIo.emit).not.toHaveBeenCalledWith('terminal-sessions-updated', expect.anything());
  });

  it('S7: terminal-init for a fresh session id also respects the cap', () => {
    const ptyService = makeService(mockIo);
    ptyService.init();
    const { socketCallbacks, mockSocket } = connectSocket('s-cap-init');

    for (let i = 0; i < MAX_SESSIONS - 1; i++) {
      socketCallbacks['terminal-create-session']({ sessionId: `cap-${i}` });
    }
    mockSocket.emit.mockClear();
    socketCallbacks['terminal-init']({ sessionId: 'init-overflow' });

    expect(mockSocket.emit).toHaveBeenCalledWith('terminal-error', expect.objectContaining({
      message: expect.stringContaining('limit')
    }));
    expect(ptyService.getSession('init-overflow')).toBeUndefined();
  });

  it('S7: reaps a session after its last subscriber disconnects (grace timer)', () => {
    vi.useFakeTimers();
    const ptyService = makeService(mockIo);
    ptyService.init();
    const { socketCallbacks } = connectSocket('s-reap');

    socketCallbacks['terminal-init']({ sessionId: 'main' });
    socketCallbacks['terminal-create-session']({ sessionId: 'work' });
    socketCallbacks['terminal-init']({ sessionId: 'work' }); // subscribe to work
    expect(ptyService.getSession('work')).toBeDefined();

    socketCallbacks['disconnect']();

    // Alive during the grace period, reaped after it.
    mockIo.emit.mockClear();
    vi.advanceTimersByTime(REAP_GRACE_MS - 1);
    expect(ptyService.getSession('work')).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(ptyService.getSession('work')).toBeUndefined();

    const calls = mockIo.emit.mock.calls.filter((c: unknown[]) => c[0] === 'terminal-sessions-updated');
    expect(calls.length).toBeGreaterThan(0);
    const list = calls[calls.length - 1][1] as { id: string }[];
    expect(list.some(s => s.id === 'work')).toBe(false);
  });

  it('S7: reaps an orphaned session whose subscriber never arrives', () => {
    vi.useFakeTimers();
    const ptyService = makeService(mockIo);
    ptyService.init();
    const { socketCallbacks } = connectSocket('s-orphan');

    // terminal-create-session without any follow-up terminal-init: the
    // session has zero subscribers and must not be immortal — with the cap,
    // nine of these would permanently block terminal creation.
    socketCallbacks['terminal-create-session']({ sessionId: 'orphan' });
    expect(ptyService.getSession('orphan')).toBeDefined();

    vi.advanceTimersByTime(REAP_GRACE_MS - 1);
    expect(ptyService.getSession('orphan')).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(ptyService.getSession('orphan')).toBeUndefined();
  });

  it('S7: a resubscriber cancels the pending reap', () => {
    vi.useFakeTimers();
    const ptyService = makeService(mockIo);
    ptyService.init();
    const a = connectSocket('s-reap-a');

    a.socketCallbacks['terminal-init']({ sessionId: 'main' });
    a.socketCallbacks['terminal-create-session']({ sessionId: 'work' });
    a.socketCallbacks['terminal-init']({ sessionId: 'work' });
    a.socketCallbacks['disconnect']();

    vi.advanceTimersByTime(REAP_GRACE_MS / 2);

    // Reconnect + resubscribe before the grace period ends.
    const b = connectSocket('s-reap-b');
    b.socketCallbacks['terminal-init']({ sessionId: 'work' });

    vi.advanceTimersByTime(REAP_GRACE_MS * 2);
    expect(ptyService.getSession('work')).toBeDefined();
  });

  it('S7: never reaps the main session', () => {
    vi.useFakeTimers();
    const ptyService = makeService(mockIo);
    ptyService.init();
    const { socketCallbacks } = connectSocket('s-main');

    socketCallbacks['terminal-init']({ sessionId: 'main' });
    socketCallbacks['disconnect']();

    vi.advanceTimersByTime(REAP_GRACE_MS * 10);
    expect(ptyService.getSession('main')).toBeDefined();
  });

  it('S7: a PTY spawn failure emits terminal-error instead of crashing the server', () => {
    const ptyService = makeService(mockIo);
    ptyService.init();
    const { socketCallbacks, mockSocket } = connectSocket('s-throw');

    const spawnSpy = vi.spyOn(pty, 'spawn').mockImplementation(() => {
      throw new Error('spawn boom');
    });

    expect(() => socketCallbacks['terminal-create-session']({ sessionId: 'doomed' })).not.toThrow();
    expect(mockSocket.emit).toHaveBeenCalledWith('terminal-error', expect.objectContaining({
      sessionId: 'doomed'
    }));
    expect(ptyService.getSession('doomed')).toBeUndefined();

    // Same guard on the terminal-init creation path.
    expect(() => socketCallbacks['terminal-init']({ sessionId: 'doomed-2' })).not.toThrow();
    expect(ptyService.getSession('doomed-2')).toBeUndefined();

    spawnSpy.mockRestore();
    // Server is still functional.
    expect(ptyService.getSession('main')).toBeDefined();
    expect(ptyService.createSession('after-failure')).toBeDefined();
  });

  it('L3: PTY data is emitted once as terminal-data, never as terminal-data-legacy', async () => {
    const ptyService = makeService(mockIo);
    const toEmit = vi.fn();
    mockIo.to.mockReturnValue({ emit: toEmit });
    ptyService.init();
    const { socketCallbacks } = connectSocket('s-data');

    socketCallbacks['terminal-init']({ sessionId: 'main' });

    await vi.waitFor(() => {
      expect(toEmit).toHaveBeenCalledWith('terminal-data', expect.objectContaining({ sessionId: 'main' }));
    }, { timeout: 10000, interval: 50 });

    const legacyCalls = toEmit.mock.calls.filter((c: unknown[]) => c[0] === 'terminal-data-legacy');
    expect(legacyCalls).toHaveLength(0);
  });

  it('L3: terminal-input with a non-string payload is ignored (no write(undefined) crash)', () => {
    const ptyService = makeService(mockIo);
    ptyService.init();
    const { socketCallbacks } = connectSocket('s-input');

    socketCallbacks['terminal-init']({ sessionId: 'main' });
    const session = ptyService.getSession('main')!;
    const writeSpy = vi.spyOn(session.ptyProcess, 'write');

    expect(() => socketCallbacks['terminal-input']({ sessionId: 'main' })).not.toThrow();
    expect(() => socketCallbacks['terminal-input']({})).not.toThrow();
    expect(() => socketCallbacks['terminal-input'](null)).not.toThrow();
    expect(writeSpy).not.toHaveBeenCalled();

    // Sanity: a real string payload still reaches the PTY.
    socketCallbacks['terminal-input']({ sessionId: 'main', data: 'x' });
    expect(writeSpy).toHaveBeenCalledWith('x');
  });

  it('L3: auto-generated session ids are unique within the same millisecond', () => {
    const ptyService = makeService(mockIo);
    // Freeze the clock: Date.now() alone collides here.
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const a = ptyService.createSession();
    const b = ptyService.createSession();

    expect(a.id).not.toBe(b.id);
    expect(ptyService.getSession(a.id)).toBe(a);
    expect(ptyService.getSession(b.id)).toBe(b);
  });

  it('C17: natural PTY exit broadcasts terminal-sessions-updated', async () => {
    const ptyService = makeService(mockIo);
    ptyService.init();
    ptyService.createSession('exit-test');
    mockIo.emit.mockClear();

    ptyService.getSession('exit-test')!.kill();

    await vi.waitFor(() => {
      expect(ptyService.getSession('exit-test')).toBeUndefined();
      const calls = mockIo.emit.mock.calls.filter((c: unknown[]) => c[0] === 'terminal-sessions-updated');
      expect(calls.length).toBeGreaterThan(0);
      const list = calls[calls.length - 1][1] as { id: string }[];
      expect(list.some(s => s.id === 'exit-test')).toBe(false);
    }, { timeout: 5000, interval: 50 });
  });

  it('C17: natural exit of main restarts it so the broadcast list always contains main', async () => {
    const ptyService = makeService(mockIo);
    ptyService.init();
    const oldPid = ptyService.getSession('main')!.ptyProcess.pid;
    mockIo.emit.mockClear();

    ptyService.getSession('main')!.kill(); // user typed `exit` in the main shell

    await vi.waitFor(() => {
      const restarted = ptyService.getSession('main');
      expect(restarted).toBeDefined();
      expect(restarted!.ptyProcess.pid).not.toBe(oldPid);
      const calls = mockIo.emit.mock.calls.filter((c: unknown[]) => c[0] === 'terminal-sessions-updated');
      expect(calls.length).toBeGreaterThan(0);
      const list = calls[calls.length - 1][1] as { id: string }[];
      expect(list.some(s => s.id === 'main')).toBe(true);
    }, { timeout: 5000, interval: 50 });
  });

  it('S7: the main restart budget stops an instant-exit spawn loop', async () => {
    const ptyService = makeService(mockIo);
    ptyService.init();

    // 3 exits within the window each restart main.
    for (let i = 0; i < 3; i++) {
      const pid = ptyService.getSession('main')!.ptyProcess.pid;
      ptyService.getSession('main')!.kill();
      await vi.waitFor(() => {
        const s = ptyService.getSession('main');
        expect(s).toBeDefined();
        expect(s!.ptyProcess.pid).not.toBe(pid);
      }, { timeout: 5000, interval: 50 });
    }

    // The 4th exit within the same minute is NOT restarted.
    ptyService.getSession('main')!.kill();
    await vi.waitFor(() => {
      expect(ptyService.getSession('main')).toBeUndefined();
    }, { timeout: 5000, interval: 50 });
    // And it stays dead (no delayed respawn).
    await new Promise(r => setTimeout(r, 300));
    expect(ptyService.getSession('main')).toBeUndefined();

    // terminal-init for main is refused while the budget is exhausted.
    const { socketCallbacks, mockSocket } = connectSocket('s-budget');
    socketCallbacks['terminal-init']({ sessionId: 'main' });
    expect(mockSocket.emit).toHaveBeenCalledWith('terminal-error', expect.objectContaining({
      sessionId: 'main'
    }));
    expect(ptyService.getSession('main')).toBeUndefined();
  });

  it('C17: an explicit close still notifies remaining subscribers via terminal-exit', async () => {
    const ptyService = makeService(mockIo);
    const toEmit = vi.fn();
    mockIo.to.mockReturnValue({ emit: toEmit });
    ptyService.init();
    const session = ptyService.createSession('explicit-close');
    // A second client is still watching when the first closes the tab.
    session.subscribers.add('socket-x');

    ptyService.closeSession('explicit-close');

    await vi.waitFor(() => {
      expect(toEmit).toHaveBeenCalledWith('terminal-exit', expect.objectContaining({
        sessionId: 'explicit-close'
      }));
    }, { timeout: 5000, interval: 50 });
  });

  it('S7: a stale exit event does not evict a same-id recreated session', async () => {
    const ptyService = makeService(mockIo);
    ptyService.init();
    const first = ptyService.createSession('recreate-me');
    ptyService.closeSession('recreate-me');
    const second = ptyService.createSession('recreate-me');

    // The first PTY's exit event arrives after the recreation; the live
    // session must survive it.
    await new Promise(r => setTimeout(r, 300));
    expect(ptyService.getSession('recreate-me')).toBe(second);
    expect(ptyService.getSession('recreate-me')).not.toBe(first);
  });
});
