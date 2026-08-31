import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentService } from '../src/services/AgentService.js';
import { LocalAgentWrapper } from '../src/services/LocalAgentWrapper.js';

// S15/S8: the 45s chat timeout raced the chat promise but (a) never killed
// the underlying agy child — a timed-out chat kept streaming into a dead
// conversation — and (b) never cleared the timer on success, leaving a
// pending 45s timer per chat.
vi.mock('chokidar', () => ({
  default: { watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })) },
}));

describe('AgentService — chat timeout lifecycle (S8)', () => {
  let connectionCb: (socket: any) => void;
  let chatSpy: ReturnType<typeof vi.spyOn>;

  function connect() {
    const handlers: Record<string, (...args: any[]) => any> = {};
    const emitted: Array<{ event: string; payload: any }> = [];
    const socket = {
      on: (ev: string, cb: (...args: any[]) => any) => { handlers[ev] = cb; },
      emit: (ev: string, payload: any) => { emitted.push({ event: ev, payload }); },
    };
    connectionCb(socket);
    return { handlers, emitted };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    const fakeIo = {
      on: (ev: string, cb: (socket: any) => void) => { if (ev === 'connection') connectionCb = cb; },
      emit: vi.fn(),
    } as any;
    new AgentService(fakeIo).start();
    chatSpy = vi.spyOn(LocalAgentWrapper.prototype, 'chat');
  });

  afterEach(() => {
    chatSpy.mockRestore();
    vi.useRealTimers();
  });

  it('aborts the in-flight chat when the 45s timeout fires', async () => {
    let capturedSignal: AbortSignal | undefined;
    chatSpy.mockImplementation(((_repo: string, _msg: string, _ctx: any, _onChunk: any, signal?: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<void>(() => { /* never resolves — a hung agent */ });
    }) as any);

    const { handlers, emitted } = connect();
    const pending = handlers['chat_message']({ message: 'hello' });
    // Let the handler reach the chat call.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(chatSpy).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(45000);
    await pending.catch(() => { /* handler resolves; defensive */ });

    expect(emitted.some((e) => e.event === 'chat_reply_error')).toBe(true);
    // Pre-fix the wrapper got no signal, so nothing killed the agy child.
    expect(capturedSignal?.aborted).toBe(true);
    expect(emitted.some((e) => e.event === 'chat_reply_complete')).toBe(false);
  });

  it('leaves no dangling 45s timer after a successful chat', async () => {
    chatSpy.mockImplementation(((_repo: string, _msg: string, _ctx: any, onChunk: (c: string) => void) => {
      onChunk('agent reply');
      return Promise.resolve();
    }) as any);

    const { handlers, emitted } = connect();
    await handlers['chat_message']({ message: 'hello' });

    expect(emitted.some((e) => e.event === 'chat_reply_complete')).toBe(true);
    // Pre-fix the setTimeout stayed pending for the full 45s per chat.
    expect(vi.getTimerCount()).toBe(0);
  });

  // Review pass 1: trigger_autofix had the identical timeout bug chat had —
  // and a hung autofix child WRITES files, so it is strictly worse.
  it('aborts the in-flight autofix when its 45s timeout fires', async () => {
    let capturedSignal: AbortSignal | undefined;
    const autofixSpy = vi.spyOn(LocalAgentWrapper.prototype, 'autofix')
      .mockImplementation(((_repo: string, _file: string, _msg: string, signal?: AbortSignal) => {
        capturedSignal = signal;
        return new Promise<void>(() => { /* never resolves — a hung agent */ });
      }) as any);

    const { handlers, emitted } = connect();
    const pending = handlers['trigger_autofix']({ file: 'x.md', message: 'violation' });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(autofixSpy).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(45000);
    await pending.catch(() => { /* defensive */ });
    autofixSpy.mockRestore();

    expect(emitted.some((e) => e.event === 'autofix_error')).toBe(true);
    expect(capturedSignal?.aborted).toBe(true);
    expect(emitted.some((e) => e.event === 'autofix_complete')).toBe(false);
  });

  it('leaves no dangling 45s timer after a successful autofix', async () => {
    const autofixSpy = vi.spyOn(LocalAgentWrapper.prototype, 'autofix')
      .mockResolvedValue(undefined);

    const { handlers, emitted } = connect();
    await handlers['trigger_autofix']({ file: 'x.md', message: 'violation' });
    autofixSpy.mockRestore();

    expect(emitted.some((e) => e.event === 'autofix_complete')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
