import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentService } from '../src/services/AgentService.js';
import { LocalAgentWrapper } from '../src/services/LocalAgentWrapper.js';
import { checkRepoStatus } from '../src/services/repoService.js';
import chokidar from 'chokidar';

// S15/S9: restartWatcher previously dropped the old watcher without awaiting
// close() and never cleared pending debounce timers — after a repo switch, a
// timer armed for a file in repo A still fired, emitting a stale agent_event
// and running analysis against the NEW repo root.
vi.mock('../src/services/repoService.js', () => ({
  checkRepoStatus: vi.fn(),
  resolvePath: (p: string) => p,
}));
vi.mock('chokidar', () => ({
  default: { watch: vi.fn() },
}));

const mockedWatch = vi.mocked(chokidar.watch);
const mockedCheckRepoStatus = vi.mocked(checkRepoStatus);

interface FakeWatcher {
  handlers: Record<string, (...args: any[]) => void>;
  close: ReturnType<typeof vi.fn>;
}

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('AgentService — watcher lifecycle (S9)', () => {
  let watchers: FakeWatcher[];
  let ioEmitted: Array<{ event: string; payload: any }>;
  let connectionCb: (socket: any) => void;

  function connect() {
    const handlers: Record<string, (...args: any[]) => any> = {};
    const socket = {
      on: (ev: string, cb: (...args: any[]) => any) => { handlers[ev] = cb; },
      emit: vi.fn(),
    };
    connectionCb(socket);
    return handlers;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('TEST_MODE', 'true');
    watchers = [];
    ioEmitted = [];
    mockedCheckRepoStatus.mockReset();
    mockedCheckRepoStatus.mockResolvedValue({ exists: true, isGit: true, isOpenSpec: true });
    mockedWatch.mockReset();
    mockedWatch.mockImplementation(() => {
      const w: FakeWatcher = {
        handlers: {},
        close: vi.fn(() => Promise.resolve()),
      };
      (w as any).on = (ev: string, cb: (...args: any[]) => void) => { w.handlers[ev] = cb; return w; };
      watchers.push(w);
      return w as any;
    });
    const fakeIo = {
      on: (ev: string, cb: (socket: any) => void) => { if (ev === 'connection') connectionCb = cb; },
      emit: (event: string, payload: any) => { ioEmitted.push({ event, payload }); },
    } as any;
    new AgentService(fakeIo).start();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('cancels a pending debounce when the repo switches — no stale event for the old repo', async () => {
    const handlers = connect();
    await handlers['set_repo_path']('/repo-a');
    expect(watchers).toHaveLength(1);

    // A file event in repo A arms a 300ms debounce timer.
    watchers[0].handlers['all']('add', '/repo-a/openspec/changes/c1/spec.md');

    await handlers['set_repo_path']('/repo-b');
    expect(watchers[0].close).toHaveBeenCalled();
    expect(watchers).toHaveLength(2);

    vi.advanceTimersByTime(1000);
    // Pre-fix the timer survived the switch and emitted a stale file_change
    // for a repo that is no longer active (and analyzed it under repo B).
    const fileEvents = ioEmitted.filter((e) => e.event === 'agent_event' && e.payload.type === 'file_change');
    expect(fileEvents).toEqual([]);
  });

  it('does not start the new watcher until the old watcher has closed', async () => {
    const handlers = connect();
    await handlers['set_repo_path']('/repo-a');
    expect(watchers).toHaveLength(1);

    const closeGate = deferred();
    watchers[0].close.mockReturnValue(closeGate.promise);

    const switching = handlers['set_repo_path']('/repo-b');
    // Flush microtasks so the async handler runs up to the watcher restart.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    // Pre-fix the second watch() fired immediately, overlapping the old watcher.
    expect(watchers).toHaveLength(1);

    closeGate.resolve();
    await switching;
    expect(watchers).toHaveLength(2);
  });

  it('debounces rapid duplicate events for the same file into one agent_event', async () => {
    const handlers = connect();
    await handlers['set_repo_path']('/repo-a');

    const file = '/repo-a/openspec/changes/c1/spec.md';
    watchers[0].handlers['all']('add', file);
    vi.advanceTimersByTime(100);
    watchers[0].handlers['all']('change', file);
    vi.advanceTimersByTime(100);
    watchers[0].handlers['all']('change', file);
    vi.advanceTimersByTime(400);

    const fileEvents = ioEmitted.filter((e) => e.event === 'agent_event' && e.payload.type === 'file_change');
    expect(fileEvents).toHaveLength(1);
    expect(fileEvents[0].payload.file).toBe(file);
  });

  it('ignores unlink events and non-md/json files', async () => {
    const handlers = connect();
    await handlers['set_repo_path']('/repo-a');

    watchers[0].handlers['all']('unlink', '/repo-a/openspec/changes/c1/spec.md');
    watchers[0].handlers['all']('add', '/repo-a/openspec/changes/c1/image.png');
    vi.advanceTimersByTime(1000);

    expect(ioEmitted.filter((e) => e.event === 'agent_event')).toEqual([]);
  });

  it('does not re-arm a file whose analysis is already in flight', async () => {
    const handlers = connect();
    await handlers['set_repo_path']('/repo-a');

    const file = '/repo-a/openspec/changes/c1/spec.md';
    watchers[0].handlers['all']('add', file);
    vi.advanceTimersByTime(400); // debounce fires, analysis starts (TEST_MODE: 500ms)
    watchers[0].handlers['all']('change', file); // in-flight — must be ignored
    vi.advanceTimersByTime(400);

    const fileEvents = ioEmitted.filter((e) => e.event === 'agent_event' && e.payload.type === 'file_change');
    expect(fileEvents).toHaveLength(1);

    // Let the TEST_MODE analysis finish; the file is analyzable again after.
    // advanceTimersByTimeAsync flushes the promise .then that re-arms the file.
    await vi.advanceTimersByTimeAsync(500);
    watchers[0].handlers['all']('change', file);
    vi.advanceTimersByTime(400);
    const after = ioEmitted.filter((e) => e.event === 'agent_event' && e.payload.type === 'file_change');
    expect(after).toHaveLength(2);
  });
});
