import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { app } from '../src/app.js';
import { checkRepoStatus } from '../src/services/repoService.js';

// S15: /api/execute edge cases beyond the cycle-2 (S2) injection suite —
// command dispatch, alias/prefix normalization, tmux attach translation,
// and the streamChildProcess error path. api.test.ts exercises these with
// real spawns; here spawn is mocked so we can assert the exact argv contract
// and simulate failure modes (ENOENT, non-zero exit) deterministically.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, spawn: vi.fn() };
});

vi.mock('../src/services/repoService.js', () => ({
  checkRepoStatus: vi.fn(),
  initializeOpenSpec: vi.fn(),
  updateChangeProvider: vi.fn(),
  getChangeMetadata: vi.fn(),
  createLocalSchema: vi.fn(),
  createNewChange: vi.fn(),
  resolvePath: (p: string) => p,
}));

const mockedSpawn = vi.mocked(spawn);
const mockedCheckRepoStatus = vi.mocked(checkRepoStatus);

function fakeChild(exitCode = 0) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const origOn = child.on.bind(child);
  // Emit only after the route attaches its 'close' listener (supertest
  // dispatch takes several ticks — a bare nextTick at construction is lost).
  child.on = (event: string, listener: (...args: any[]) => void) => {
    origOn(event, listener);
    if (event === 'close') {
      process.nextTick(() => child.emit('close', exitCode));
    }
    return child;
  };
  return child;
}

// Simulates a missing binary: spawn raises 'error' (ENOENT), then Node still
// emits 'close'. streamChildProcess must settle exactly once on the error.
function fakeErrorChild(err: Error) {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const origOn = child.on.bind(child);
  child.on = (event: string, listener: (...args: any[]) => void) => {
    origOn(event, listener);
    if (event === 'close') {
      process.nextTick(() => {
        child.emit('error', err);
        child.emit('close', -2);
      });
    }
    return child;
  };
  return child;
}

describe('POST /api/execute — dispatch and argv contract (S15)', () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
    mockedCheckRepoStatus.mockReset();
    mockedCheckRepoStatus.mockResolvedValue({ exists: true, isGit: true, isOpenSpec: true });
    mockedSpawn.mockReturnValue(fakeChild(0));
  });

  it('rejects a request with no command and never spawns', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      args: ['hello'],
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/not allowed/);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('rejects a non-string arg element', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'echo',
      args: ['ok', 42],
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid args/);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('rejects a non-string changeName', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'opsx-verify',
      changeName: { evil: true },
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid changeName/);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('runs a shell command with args omitted (treated as empty argv)', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'ls',
    });
    expect(response.status).toBe(200);
    expect(mockedSpawn).toHaveBeenCalledWith('ls', [], expect.objectContaining({ cwd: '/tmp/repo' }));
  });

  it('does not consult repo status when repoPath is omitted', async () => {
    const response = await request(app).post('/api/execute').send({
      command: 'echo',
      args: ['hi'],
    });
    expect(response.status).toBe(200);
    expect(mockedCheckRepoStatus).not.toHaveBeenCalled();
  });

  it('normalizes the ag/antigravity aliases to agy', async () => {
    for (const alias of ['ag', 'antigravity']) {
      mockedSpawn.mockClear();
      const response = await request(app).post('/api/execute').send({
        repoPath: '/tmp/repo',
        command: alias,
        args: ['run', '--prompt=x'],
      });
      expect(response.status).toBe(200);
      expect(mockedSpawn).toHaveBeenCalledWith('agy', ['run', '--prompt=x'], expect.anything());
    }
  });

  it('prefixes openspec commands with npx', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'openspec',
      args: ['list', '--json'],
    });
    expect(response.status).toBe(200);
    expect(mockedSpawn).toHaveBeenCalledWith('npx', ['openspec', 'list', '--json'], expect.anything());
  });

  it('opsx-new kebab-cases the change name (spaces are not shell metacharacters)', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'opsx-new',
      args: ['My Cool Change'],
    });
    expect(response.status).toBe(200);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'npx',
      ['openspec', 'new', 'change', 'my-cool-change'],
      expect.anything()
    );
  });

  it('opsx-new falls back to "default" with no name', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'opsx-new',
      args: [],
    });
    expect(response.status).toBe(200);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'npx',
      ['openspec', 'new', 'change', 'default'],
      expect.anything()
    );
  });

  it('opsx-verify targets changeName, then args[0], then "main"', async () => {
    mockedSpawn.mockClear();
    await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'opsx-verify',
      changeName: 'feat-x',
    });
    expect(mockedSpawn).toHaveBeenLastCalledWith(
      'npx', ['openspec', 'status', '--change', 'feat-x'], expect.anything()
    );

    await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'opsx-verify',
      args: ['feat-y'],
    });
    expect(mockedSpawn).toHaveBeenLastCalledWith(
      'npx', ['openspec', 'status', '--change', 'feat-y'], expect.anything()
    );

    await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'opsx-verify',
    });
    expect(mockedSpawn).toHaveBeenLastCalledWith(
      'npx', ['openspec', 'status', '--change', 'main'], expect.anything()
    );
  });

  it('translates tmux attach into a non-interactive capture-pane', async () => {
    mockedSpawn.mockReturnValue(fakeChild(0));
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'tmux',
      args: ['attach', '-t', 'agent-feat-x'],
    });
    expect(response.status).toBe(200);
    // An interactive `tmux attach` would hijack the HTTP response stream;
    // the server must rewrite it to capture-pane -pt <session>.
    expect(mockedSpawn).toHaveBeenCalledWith(
      'tmux',
      ['capture-pane', '-pt', 'agent-feat-x'],
      expect.anything()
    );
  });

  it('passes non-attach tmux argv through unchanged', async () => {
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'tmux',
      args: ['list-sessions'],
    });
    expect(response.status).toBe(200);
    expect(mockedSpawn).toHaveBeenCalledWith('tmux', ['list-sessions'], expect.anything());
  });

  it('annotates the stream when a targeted tmux session is gone', async () => {
    mockedSpawn.mockReturnValue(fakeChild(1));
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'tmux',
      args: ['attach', '-t', 'agent-gone'],
    });
    expect(response.status).toBe(200);
    expect(response.text).toContain("[tmux session 'agent-gone' is not running or has completed]");
    expect(response.text).toContain('[Process exited with code 1]');
  });

  it('settles the response exactly once on spawn ENOENT (error, not exit marker)', async () => {
    mockedSpawn.mockReturnValue(fakeErrorChild(new Error('spawn cow-not-a-cmd ENOENT')));
    const response = await request(app).post('/api/execute').send({
      repoPath: '/tmp/repo',
      command: 'echo',
      args: ['hi'],
    });
    // The error branch ends the response; the trailing 'close' event must not
    // append an exit marker or write to an already-ended response.
    expect(response.text).toContain("Failed to start command 'echo': spawn cow-not-a-cmd ENOENT");
    expect(response.text).not.toContain('[Process exited');
  });
});
