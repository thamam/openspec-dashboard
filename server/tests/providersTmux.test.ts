import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { ClaudeProvider } from '../src/agents/providers/ClaudeProvider.js';
import { CodexProvider } from '../src/agents/providers/CodexProvider.js';
import { AntiGravityProvider } from '../src/agents/providers/AntiGravityProvider.js';

// Mock child_process.spawn so no real tmux session is created; capture calls.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, spawn: vi.fn() };
});

const mockedSpawn = vi.mocked(spawn);

function fakeChild(exitCode = 0) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const origOn = child.on.bind(child);
  child.on = (event: string, listener: (...args: any[]) => void) => {
    origOn(event, listener);
    if (event === 'close') {
      process.nextTick(() => child.emit('close', exitCode));
    }
    return child;
  };
  return child;
}

// Simulates a missing tmux binary: spawn emits 'error' (ENOENT). Without an
// 'error' listener on the child, EventEmitter throws — the pre-fix crash.
function fakeErrorChild(err: Error) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  process.nextTick(() => child.emit('error', err));
  return child;
}

const HOSTILE = 'evil"$(touch s13-pwn)`id`;rm -rf ~|\'quoted\'';

// S13: every provider handed its prompt/instruction to tmux as ONE shell
// command string, which tmux executes via `sh -c` — socket-controlled
// workflow args (execute_workflow channel) injected `"`/`$()` into it.
// The fix must pass the agent command as an argv array after `--`, which
// tmux (verified live against tmux 3.6a) execs directly with no shell.
function expectTmuxArgv(call: any[], expectedSessionPrefix: string, expectedAgentArgv: any[]) {
  const [cmd, argv, opts] = call;
  expect(cmd).toBe('tmux');
  expect((opts as any)?.shell ?? false).toBe(false);
  const args = argv as string[];
  // new-session -d -s <name> -- <agent argv...>
  expect(args.slice(0, 3)).toEqual(['new-session', '-d', '-s']);
  expect(args[3]).toMatch(new RegExp(`^${expectedSessionPrefix}`));
  // `--` ends tmux's own option parsing so a hostile payload can never be
  // re-read as a tmux flag.
  expect(args[4]).toBe('--');
  // The agent command rides as discrete argv elements — never joined into a
  // shell string.
  expect(args.slice(5)).toEqual(expectedAgentArgv);
}

describe('Agent providers — tmux spawn contract (S13)', () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
    mockedSpawn.mockReturnValue(fakeChild(0));
  });

  it('ClaudeProvider.executeLifecycle passes a hostile instruction as a literal argv element, no shell', async () => {
    await new ClaudeProvider().executeLifecycle('opsx-propose', [HOSTILE], '/ws');
    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    expectTmuxArgv(mockedSpawn.mock.calls[0], 'agent-', ['claude', '--permission-mode', 'auto', expect.any(String)]);
    const argv = mockedSpawn.mock.calls[0][1] as string[];
    const instruction = argv[argv.length - 1];
    expect(instruction).toContain(HOSTILE); // verbatim, one element
    expect(instruction.startsWith('Please')).toBe(true); // never a leading-dash positional
  });

  it('CodexProvider.executeLifecycle passes a hostile instruction as a literal argv element, no shell', async () => {
    await new CodexProvider().executeLifecycle('opsx-propose', [HOSTILE], '/ws');
    expectTmuxArgv(mockedSpawn.mock.calls[0], 'agent-', [
      'codex', '--ask-for-approval', 'never', '--sandbox', 'workspace-write', expect.any(String),
    ]);
    const argv = mockedSpawn.mock.calls[0][1] as string[];
    expect(argv[argv.length - 1]).toContain(HOSTILE);
  });

  it('AntiGravityProvider.executeLifecycle keeps a hostile workspacePath inside one --add-dir= token', async () => {
    const hostileWs = '/tmp/ws"$(touch s13-pwn2)`id` --dangerously-skip-permissions';
    await new AntiGravityProvider().executeLifecycle('opsx-propose', ['change1'], hostileWs);
    expectTmuxArgv(mockedSpawn.mock.calls[0], 'agent-', [
      'agy', '--mode', 'accept-edits',
      `--add-dir=${hostileWs}`, // single --flag=value token: cannot be re-read as flags
      '-p', expect.any(String),
      '--dangerously-skip-permissions',
    ]);
  });

  it.each([
    ['Claude', () => new ClaudeProvider()],
    ['Codex', () => new CodexProvider()],
    ['AntiGravity', () => new AntiGravityProvider()],
  ])('%s executeTask passes hostile taskContext as literal argv text', async (_name, make) => {
    await make().executeTask(HOSTILE, '/ws');
    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    const argv = mockedSpawn.mock.calls[0][1] as string[];
    expect(argv[4]).toBe('--');
    // The prompt is one verbatim argv element (position differs per provider).
    const promptEl = argv.find((el) => el.includes(HOSTILE));
    expect(promptEl).toBeDefined();
    expect(promptEl!.startsWith('Please')).toBe(true);
  });

  it.each([
    ['Claude', () => new ClaudeProvider()],
    ['Codex', () => new CodexProvider()],
    ['AntiGravity', () => new AntiGravityProvider()],
  ])('%s slugifies the session name to a safe tmux target', async (_name, make) => {
    await make().executeLifecycle('opsx-propose', [HOSTILE], '/ws');
    const argv = mockedSpawn.mock.calls[0][1] as string[];
    expect(argv[3]).toMatch(/^agent-[a-zA-Z0-9_-]+$/);
  });

  it.each([
    ['Claude', () => new ClaudeProvider()],
    ['Codex', () => new CodexProvider()],
    ['AntiGravity', () => new AntiGravityProvider()],
  ])('%s surfaces tmux spawn ENOENT via onError instead of crashing', async (_name, make) => {
    mockedSpawn.mockReturnValue(fakeErrorChild(Object.assign(new Error('spawn tmux ENOENT'), { code: 'ENOENT' })));
    const stream = await make().executeTask('task', '/ws');
    const errors: string[] = [];
    stream.onError((e) => errors.push(e));
    await new Promise((r) => setTimeout(r, 20));
    expect(errors.join(' ')).toContain('ENOENT');
  });
});
