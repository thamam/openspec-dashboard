import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import path from 'path';
import { LocalAgentWrapper } from '../src/services/LocalAgentWrapper.js';

// Mock child_process.spawn so no real `agy` agent runs; capture every call.
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
  // Emit 'close' only once the wrapper has attached its listener.
  child.on = (event: string, listener: (...args: any[]) => void) => {
    origOn(event, listener);
    if (event === 'close') {
      process.nextTick(() => child.emit('close', exitCode));
    }
    return child;
  };
  return child;
}

// Simulates a missing `agy` binary: spawn emits 'error' (ENOENT) on the next
// tick. If the wrapper attaches no 'error' listener, EventEmitter throws and
// the test fails — which is exactly the pre-fix server-crash behavior.
function fakeErrorChild(err: Error) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  process.nextTick(() => child.emit('error', err));
  return child;
}

describe('LocalAgentWrapper — spawn contract (S5)', () => {
  let wrapper: LocalAgentWrapper;
  // autofix containment canonicalizes the root with realpath, so spawn-contract
  // tests need a repo dir that actually exists on disk.
  let realRepo: string;

  beforeEach(async () => {
    mockedSpawn.mockReset();
    mockedSpawn.mockReturnValue(fakeChild(0));
    // Bypass the TEST_MODE mock path so the real spawn contract is exercised.
    vi.stubEnv('TEST_MODE', 'false');
    wrapper = new LocalAgentWrapper();
    const fs = await import('fs');
    const os = await import('os');
    realRepo = fs.mkdtempSync(path.join(os.tmpdir(), 's13-spawn-repo-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const fs = await import('fs');
    fs.rmSync(realRepo, { recursive: true, force: true });
  });

  it('analyzeFile spawns agy with argv array and NO shell', async () => {
    await wrapper.analyzeFile('/repo', '/repo/src/file.md', () => {});

    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mockedSpawn.mock.calls[0];
    expect(cmd).toBe('agy');
    // Option values use the --flag=<value> single-token form so a value
    // starting with '-' cannot be re-read as a flag by agy's option parser.
    expect(args).toEqual([
      'run',
      '--cwd=/repo',
      expect.stringMatching(/^--prompt=.*file\.md/),
    ]);
    // The whole point of S5: no shell => no metacharacter reinterpretation.
    expect((opts as any)?.shell ?? false).toBe(false);
  });

  it('analyzeFile passes an adversarial file name through as literal prompt text', async () => {
    const evilName = 'x$(touch s5-pwn)`touch s5-pwn2`";evil.md';
    await wrapper.analyzeFile('/repo', `/repo/${evilName}`, () => {});

    const args = mockedSpawn.mock.calls[0][1] as string[];
    expect(args[2]).toContain(evilName);
    expect((mockedSpawn.mock.calls[0][2] as any)?.shell ?? false).toBe(false);
  });

  it('chat passes a message full of shell metacharacters as literal prompt text, no shell', async () => {
    const message = 'run `id` ; $(whoami) && rm -rf ~ | "quoted" \'single\' \\ escaped\nnext line';
    await wrapper.chat('/repo', message, {}, () => {});

    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mockedSpawn.mock.calls[0];
    expect(cmd).toBe('agy');
    expect(args).toEqual([
      'run',
      '--cwd=/repo',
      expect.stringContaining(`User Request: "${message}"`),
    ]);
    expect((args as string[])[2].startsWith('--prompt=')).toBe(true);
    expect((opts as any)?.shell ?? false).toBe(false);
  });

  it('chat embeds activeChange context without spawning extra processes', async () => {
    await wrapper.chat('/repo', 'hi', { activeChange: 'my-change' }, () => {});

    const args = mockedSpawn.mock.calls[0][1] as string[];
    expect(args[2]).toContain('Active Change: my-change');
    expect(mockedSpawn).toHaveBeenCalledTimes(1);
  });

  it('autofix passes an adversarial warning message as literal prompt text, no shell', async () => {
    const warningMessage = 'violation $(touch s5-pwn3) `id` "quoted"';
    await wrapper.autofix(realRepo, path.join(realRepo, 'file.md'), warningMessage);

    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = mockedSpawn.mock.calls[0];
    expect(cmd).toBe('agy');
    expect(args).toEqual([
      'run',
      `--cwd=${realRepo}`,
      expect.stringContaining(`"${warningMessage}"`),
    ]);
    expect((args as string[])[2].startsWith('--prompt=')).toBe(true);
    expect((opts as any)?.shell ?? false).toBe(false);
  });

  it('analyzeFile resolves null when agy exits non-zero (existing behavior preserved)', async () => {
    mockedSpawn.mockReturnValue(fakeChild(1));
    const result = await wrapper.analyzeFile('/repo', '/repo/file.md', () => {});
    expect(result).toBeNull();
  });

  it('analyzeFile resolves null (no crash) when agy is missing (spawn ENOENT)', async () => {
    mockedSpawn.mockReturnValue(fakeErrorChild(Object.assign(new Error('spawn agy ENOENT'), { code: 'ENOENT' })));
    const result = await wrapper.analyzeFile('/repo', '/repo/file.md', () => {});
    expect(result).toBeNull();
  });

  it('chat resolves (no crash) when agy is missing (spawn ENOENT)', async () => {
    mockedSpawn.mockReturnValue(fakeErrorChild(Object.assign(new Error('spawn agy ENOENT'), { code: 'ENOENT' })));
    await expect(wrapper.chat('/repo', 'hi', {}, () => {})).resolves.toBeUndefined();
  });

  it('autofix resolves (no crash) when agy is missing (spawn ENOENT)', async () => {
    mockedSpawn.mockReturnValue(fakeErrorChild(Object.assign(new Error('spawn agy ENOENT'), { code: 'ENOENT' })));
    await expect(wrapper.autofix(realRepo, path.join(realRepo, 'file.md'), 'warn')).resolves.toBeUndefined();
  });
});

// Socket-trust-boundary fix (cycle 7): trigger_autofix hands autofix() a
// fully client-controlled path that previously reached fs.writeFileSync
// verbatim — an arbitrary file write. autofix must contain the target under
// the active repo. TEST_MODE exercises the guard without spawning agy.
describe('LocalAgentWrapper — autofix path containment', () => {
  let wrapper: LocalAgentWrapper;
  let repo: string;
  let outside: string;

  beforeEach(async () => {
    vi.stubEnv('TEST_MODE', 'true');
    wrapper = new LocalAgentWrapper();
    const fs = await import('fs');
    const os = await import('os');
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 's13-autofix-repo-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 's13-autofix-outside-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const fs = await import('fs');
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('rejects an absolute path outside the repo and leaves the sentinel untouched', async () => {
    const fs = await import('fs');
    const sentinel = path.join(outside, 'sentinel.md');
    fs.writeFileSync(sentinel, 'ORIGINAL');

    await expect(wrapper.autofix(repo, sentinel, 'warn')).rejects.toThrow(/outside|escape|invalid/i);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('ORIGINAL');
  });

  it('rejects a ../ traversal that escapes the repo', async () => {
    const fs = await import('fs');
    const sentinel = path.join(outside, 'sentinel.md');
    fs.writeFileSync(sentinel, 'ORIGINAL');
    const rel = path.relative(repo, sentinel); // e.g. ../s13-autofix-outside-xxx/sentinel.md
    expect(rel.startsWith('..')).toBe(true);

    await expect(wrapper.autofix(repo, rel, 'warn')).rejects.toThrow(/outside|escape|invalid/i);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('ORIGINAL');
  });

  it('rejects when no repo path is active', async () => {
    await expect(wrapper.autofix('', 'anything.md', 'warn')).rejects.toThrow();
  });

  it('writes an in-repo relative path', async () => {
    const fs = await import('fs');
    const target = path.join(repo, 'file.md');
    fs.writeFileSync(target, '# Before');
    await wrapper.autofix(repo, 'file.md', 'warn');
    expect(fs.readFileSync(target, 'utf8')).toContain('Fixed in Test Mode');
  });

  it('writes an in-repo absolute path (legit client flow: chokidar sends absolute paths)', async () => {
    const fs = await import('fs');
    const target = path.join(repo, 'abs.md');
    await wrapper.autofix(repo, target, 'warn');
    expect(fs.readFileSync(target, 'utf8')).toContain('Fixed in Test Mode');
  });

  it('rejects a symlink inside the repo that points outside (write would follow it)', async () => {
    const fs = await import('fs');
    fs.symlinkSync(outside, path.join(repo, 'link'));
    const sentinel = path.join(outside, 'sentinel.md');
    fs.writeFileSync(sentinel, 'ORIGINAL');

    await expect(wrapper.autofix(repo, 'link/sentinel.md', 'warn')).rejects.toThrow(/outside|escape|invalid/i);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('ORIGINAL');
  });
});
