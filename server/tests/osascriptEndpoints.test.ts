import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile, exec } from 'child_process';
import { app, buildOsascriptArgs } from '../src/app.js';

// Mock child_process so tests never launch real terminal apps or dialogs.
// `exec` is mocked too: the pre-fix code used it (a shell!), and asserting it
// stays uncalled proves no shell is involved in the osascript invocation.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, execFile: vi.fn(), exec: vi.fn() };
});

const mockedExecFile = vi.mocked(execFile) as any;
const mockedExec = vi.mocked(exec) as any;
// Real execFile handle that bypasses the mock, for the real-binary probe tests.
const realExecFile = (await vi.importActual<typeof import('child_process')>('child_process')).execFile;

function execFileSucceeds(stdout = '') {
  mockedExecFile.mockImplementation((file: string, args: string[], cb: (...a: any[]) => void) => {
    // The callback is handed over synchronously at call time, so a plain
    // nextTick is safe (no listener-attach race like with EventEmitter spawns).
    process.nextTick(() => cb(null, stdout, ''));
    return new EventEmitter();
  });
}

function execFileFails(message = 'osascript failed') {
  mockedExecFile.mockImplementation((file: string, args: string[], cb: (...a: any[]) => void) => {
    process.nextTick(() => cb(new Error(message), '', ''));
    return new EventEmitter();
  });
}

// Adversarial payloads. Each targets a different reinterpretation layer:
// shell single-quote breakout (the original S4 bug), double-quote, backslash,
// $()/backtick command substitution, osascript's own option parser (-e), and
// embedded newlines. All must arrive at osascript as one literal argv element.
const PWN = '/tmp/s4-pwn-should-never-exist';
const PAYLOADS = [
  `'; touch ${PWN}; '`,
  `"; touch ${PWN}; "`,
  `\\'; touch ${PWN}; #`,
  `$(touch ${PWN})`,
  `\`touch ${PWN}\``,
  `-e do shell script "touch ${PWN}"`,
  '-e',
  `line1\nline2; touch ${PWN}`,
];

afterAll(() => {
  // If any assertion about "never executed" ever regresses, clean up.
  try { fs.rmSync(PWN, { force: true }); } catch { /* ignore */ }
});

// Extract the -e script lines from an osascript argv, asserting structure.
function scriptLinesFrom(args: string[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < args.length - 2; i += 2) {
    expect(args[i]).toBe('-e');
    lines.push(args[i + 1]);
  }
  return lines;
}

describe('POST /api/open-terminal — osascript argv contract (S4)', () => {
  beforeEach(() => {
    mockedExecFile.mockReset();
    mockedExec.mockReset();
  });

  it('returns 400 when command is missing and never spawns osascript', async () => {
    const response = await request(app).post('/api/open-terminal').send({});
    expect(response.status).toBe(400);
    expect(mockedExecFile).not.toHaveBeenCalled();
    expect(mockedExec).not.toHaveBeenCalled();
  });

  it('returns 400 when command is not a string', async () => {
    const response = await request(app).post('/api/open-terminal').send({ command: 42 });
    expect(response.status).toBe(400);
    expect(mockedExecFile).not.toHaveBeenCalled();
  });

  it('runs a legit command as one literal argv element after --, with no shell', async () => {
    execFileSucceeds();

    const response = await request(app).post('/api/open-terminal').send({
      command: 'tmux attach -t agent-my-change',
    });

    expect(response.status).toBe(200);
    expect(mockedExecFile).toHaveBeenCalledTimes(1);
    const [file, args, third] = mockedExecFile.mock.calls[0];
    expect(file).toBe('/usr/bin/osascript');
    expect(args[args.length - 1]).toBe('tmux attach -t agent-my-change');
    expect(args[args.length - 2]).toBe('--');
    // 3-arg form: execFile(file, args, callback) — no options object, so no shell
    expect(typeof third).toBe('function');
    expect(mockedExec).not.toHaveBeenCalled();
  });

  it.each(PAYLOADS)('delivers payload %j as literal data — verbatim argv, absent from script source', async (command) => {
    execFileSucceeds();

    const response = await request(app).post('/api/open-terminal').send({ command });

    expect(response.status).toBe(200);
    expect(mockedExecFile).toHaveBeenCalledTimes(1);
    const [file, args] = mockedExecFile.mock.calls[0];
    expect(file).toBe('/usr/bin/osascript');
    // Verbatim, single element, shielded behind --
    expect(args[args.length - 1]).toBe(command);
    expect(args[args.length - 2]).toBe('--');
    // Never interpolated into the AppleScript source
    expect(scriptLinesFrom(args).join('\n')).not.toContain(command);
    expect(mockedExec).not.toHaveBeenCalled();
    expect(fs.existsSync(PWN)).toBe(false);
  });

  it('returns 500 when osascript fails', async () => {
    execFileFails();

    const response = await request(app).post('/api/open-terminal').send({ command: 'zsh' });

    expect(response.status).toBe(500);
    expect(response.body.error).toMatch(/osascript failed/);
  });
});

describe('POST /api/browse-directory — osascript argv contract (S4)', () => {
  beforeEach(() => {
    mockedExecFile.mockReset();
    mockedExec.mockReset();
  });

  it('defaults to the home directory when defaultPath is missing', async () => {
    execFileSucceeds('/chosen/dir/\n');

    const response = await request(app).post('/api/browse-directory').send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, path: '/chosen/dir' });
    const [file, args] = mockedExecFile.mock.calls[0];
    expect(file).toBe('/usr/bin/osascript');
    expect(args[args.length - 1]).toBe(os.homedir());
    expect(args[args.length - 2]).toBe('--');
    expect(mockedExec).not.toHaveBeenCalled();
  });

  it('uses an existing defaultPath verbatim', async () => {
    execFileSucceeds('/chosen/dir\n');

    const response = await request(app).post('/api/browse-directory').send({ defaultPath: os.tmpdir() });

    expect(response.status).toBe(200);
    const [, args] = mockedExecFile.mock.calls[0];
    expect(args[args.length - 1]).toBe(path.resolve(os.tmpdir()));
  });

  it('treats a non-string defaultPath as missing and falls back to home', async () => {
    execFileSucceeds('/chosen/dir\n');

    const response = await request(app).post('/api/browse-directory').send({ defaultPath: 123 });

    expect(response.status).toBe(200);
    const [, args] = mockedExecFile.mock.calls[0];
    expect(args[args.length - 1]).toBe(os.homedir());
  });

  it('falls back to home when defaultPath does not exist', async () => {
    execFileSucceeds('/chosen/dir\n');

    const response = await request(app).post('/api/browse-directory').send({
      defaultPath: '/definitely/not/a/real/path/s4',
    });

    expect(response.status).toBe(200);
    const [, args] = mockedExecFile.mock.calls[0];
    expect(args[args.length - 1]).toBe(os.homedir());
  });

  it('delivers a hostile existing directory name as literal data, absent from script source', async () => {
    execFileSucceeds('/chosen/dir\n');
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 's4-'));
    const nasty = path.join(parent, `a'b"c$()\\\`tick\``);
    fs.mkdirSync(nasty);

    try {
      const response = await request(app).post('/api/browse-directory').send({ defaultPath: nasty });

      expect(response.status).toBe(200);
      const [, args] = mockedExecFile.mock.calls[0];
      expect(args[args.length - 1]).toBe(nasty);
      expect(args[args.length - 2]).toBe('--');
      expect(scriptLinesFrom(args).join('\n')).not.toContain(nasty);
      expect(mockedExec).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it('reports cancelled on CANCELLED, empty output, or osascript error', async () => {
    execFileSucceeds('CANCELLED\n');
    let response = await request(app).post('/api/browse-directory').send({});
    expect(response.body).toEqual({ cancelled: true });

    execFileSucceeds('');
    response = await request(app).post('/api/browse-directory').send({});
    expect(response.body).toEqual({ cancelled: true });

    execFileFails();
    response = await request(app).post('/api/browse-directory').send({});
    expect(response.body).toEqual({ cancelled: true });
  });
});

// End-to-end proof against the REAL osascript binary (macOS): the payloads
// above must pass through execFile + argv exactly as-is, with no shell and no
// osascript option-parser reinterpretation. The probe script never tells any
// application, so nothing opens on the desktop.
describe.runIf(fs.existsSync('/usr/bin/osascript'))('real osascript binary — argv delivery (S4)', () => {
  const PROBE = ['on run argv', 'return item 1 of argv', 'end run'];

  it('all payloads arrive literally and execute nothing', async () => {
    for (const payload of PAYLOADS) {
      const args = buildOsascriptArgs(PROBE, [payload]);
      const stdout = await new Promise<string>((resolve, reject) => {
        realExecFile('/usr/bin/osascript', args, (err, out) => (err ? reject(err) : resolve(String(out))));
      });
      expect(stdout).toBe(payload + '\n');
    }
    expect(fs.existsSync(PWN)).toBe(false);
  });

  it('without the -- guard, a leading -e payload IS reinterpreted (documents why -- is load-bearing)', async () => {
    const withoutGuard = [...PROBE.flatMap((line) => ['-e', line]), '-e'];
    await expect(
      new Promise((resolve, reject) => {
        realExecFile('/usr/bin/osascript', withoutGuard, (err, out) => (err ? reject(err) : resolve(out)));
      })
    ).rejects.toThrow(); // osascript: option requires an argument -- e

    const withGuard = buildOsascriptArgs(PROBE, ['-e']);
    const stdout = await new Promise<string>((resolve, reject) => {
      realExecFile('/usr/bin/osascript', withGuard, (err, out) => (err ? reject(err) : resolve(String(out))));
    });
    expect(stdout).toBe('-e\n');
  });
});

// The mocked contract tests never reach AppleScript, so a syntax error or
// application-terminology collision (a variable name clashing with an app's
// dictionary term) would ship green. Compile the EXACT script source each
// endpoint sends, captured from the mocked execFile call.
describe.runIf(fs.existsSync('/usr/bin/osacompile'))('production AppleScript compiles (S4)', () => {
  function compile(lines: string[]): Promise<void> {
    const src = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 's4-compile-')), 'script.applescript');
    fs.writeFileSync(src, lines.join('\n'));
    return new Promise((resolve, reject) => {
      realExecFile('/usr/bin/osacompile', ['-o', `${src}.scpt`, src], (err, _out, stderr) =>
        err ? reject(new Error(String(stderr) || err.message)) : resolve()
      );
    });
  }

  beforeEach(() => {
    mockedExecFile.mockReset();
  });

  it('/api/open-terminal script compiles', async () => {
    execFileSucceeds();
    await request(app).post('/api/open-terminal').send({ command: 'zsh' });
    await expect(compile(scriptLinesFrom(mockedExecFile.mock.calls[0][1]))).resolves.toBeUndefined();
  });

  it('/api/browse-directory script compiles', async () => {
    execFileSucceeds('/chosen/dir\n');
    await request(app).post('/api/browse-directory').send({});
    await expect(compile(scriptLinesFrom(mockedExecFile.mock.calls[0][1]))).resolves.toBeUndefined();
  });
});
