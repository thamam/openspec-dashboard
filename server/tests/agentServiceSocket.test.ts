import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { AgentService } from '../src/services/AgentService.js';
import { checkRepoStatus } from '../src/services/repoService.js';

// Mock repoService so no real git/fs probing runs; chokidar so no real
// watcher is started.
vi.mock('../src/services/repoService.js', () => ({
  checkRepoStatus: vi.fn(),
  resolvePath: (p: string) => p,
}));
vi.mock('chokidar', () => ({
  default: { watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })) },
}));

const mockedCheckRepoStatus = vi.mocked(checkRepoStatus);

// Cycle 7 review: set_repo_path was accepted verbatim and became the
// containment root for autofix writes — one emit ('/etc') voided the
// boundary. It must now be validated like the REST surface.
describe('AgentService — socket trust boundary (set_repo_path + trigger_autofix)', () => {
  let repo: string;
  let outside: string;
  let connectionCb: (socket: any) => void;

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

  async function waitForEvent(emitted: Array<{ event: string }>, event: string) {
    await vi.waitFor(() => {
      expect(emitted.some((e) => e.event === event)).toBe(true);
    }, { timeout: 5000 });
  }

  beforeEach(() => {
    vi.stubEnv('TEST_MODE', 'true');
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 's13-sock-repo-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 's13-sock-outside-'));
    mockedCheckRepoStatus.mockReset();
    mockedCheckRepoStatus.mockResolvedValue({ exists: true, isGit: true, isOpenSpec: true });
    const fakeIo = {
      on: (ev: string, cb: (socket: any) => void) => { if (ev === 'connection') connectionCb = cb; },
    } as any;
    new AgentService(fakeIo).start();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('rejects a repoPath that is not a git repository — it cannot become the autofix root', async () => {
    mockedCheckRepoStatus.mockResolvedValue({ exists: true, isGit: false, isOpenSpec: false });
    const { handlers, emitted } = connect();
    await handlers['set_repo_path']('/etc');

    expect(emitted.some((e) => e.event === 'repo_error')).toBe(true);
    // And the reviewer's exploit chain dies: autofix has no valid root.
    await handlers['trigger_autofix']({ file: 'cron.d/pwn', message: 'x' });
    await waitForEvent(emitted, 'autofix_error');
    expect(emitted.some((e) => e.event === 'autofix_complete')).toBe(false);
  });

  it('rejects a non-string repoPath without crashing (previously a synchronous TypeError)', async () => {
    const { handlers, emitted } = connect();
    await handlers['set_repo_path']({ evil: true } as any);
    expect(emitted.some((e) => e.event === 'repo_error')).toBe(true);
  });

  it('rejects a repoPath containing shell metacharacters', async () => {
    const { handlers, emitted } = connect();
    await handlers['set_repo_path']('/tmp/$(id)');
    expect(emitted.some((e) => e.event === 'repo_error')).toBe(true);
    expect(mockedCheckRepoStatus).not.toHaveBeenCalled();
  });

  it('accepts a valid git repo and autofix writes only inside it', async () => {
    const { handlers, emitted } = connect();
    await handlers['set_repo_path'](repo);
    expect(emitted.some((e) => e.event === 'repo_error')).toBe(false);

    // In-repo write works (legit flow).
    const target = path.join(repo, 'ok.md');
    fs.writeFileSync(target, '# Before');
    await handlers['trigger_autofix']({ file: target, message: 'violation' });
    await waitForEvent(emitted, 'autofix_complete');
    expect(fs.readFileSync(target, 'utf8')).toContain('Fixed in Test Mode');

    // Out-of-repo write is rejected with an error event.
    const sentinel = path.join(outside, 'sentinel.md');
    fs.writeFileSync(sentinel, 'ORIGINAL');
    await handlers['trigger_autofix']({ file: sentinel, message: 'violation' });
    await waitForEvent(emitted, 'autofix_error');
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('ORIGINAL');
  });
});
