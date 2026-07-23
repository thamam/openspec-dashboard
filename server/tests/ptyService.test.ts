import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PtyService, PtySession } from '../src/services/PtyService.js';
import { Server } from 'socket.io';

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
    const ptyService = new PtyService(mockIo as unknown as Server);
    expect(ptyService).toBeDefined();

    ptyService.init();
    expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
    expect(ptyService.getSession('main')).toBeDefined();
  });

  it('should create and retrieve custom sessions', () => {
    const ptyService = new PtyService(mockIo as unknown as Server);
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
    const session = new PtySession('buffer-test', 80, 24);
    session.appendBuffer('Hello World\n');

    expect(session.buffer).toBe('Hello World\n');

    // Test buffer truncation logic
    const longString = 'A'.repeat(120000);
    session.appendBuffer(longString);

    expect(session.buffer.length).toBeLessThanOrEqual(100000);

    session.kill();
  });

  it('should handle client connection and replay history buffer', () => {
    const ptyService = new PtyService(mockIo as unknown as Server);
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

