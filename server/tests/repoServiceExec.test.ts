import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';

// Mock child_process exec sinks so no real git/openspec runs here; capture every call.
// (repoService.test.ts separately covers the real-binary integration path.)
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, exec: vi.fn(), execFile: vi.fn() };
});

const mockedExecFile = vi.mocked(execFile);

import {
  createLocalSchema,
  createNewChange,
} from '../src/services/repoService.js';

describe('repoService — exec sink contract (S5 widened)', () => {
  let gitDir: string;

  beforeAll(() => {
    gitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-svc-exec-test-'));
    fs.mkdirSync(path.join(gitDir, '.git'));
  });

  afterAll(() => {
    fs.rmSync(gitDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    mockedExecFile.mockReset();
    (mockedExecFile as any).mockImplementation(
      (_file: string, _args: string[], _opts: any, cb: (e: any, out: string, err: string) => void) => {
        process.nextTick(() => cb(null, '', ''));
        return {};
      }
    );
  });

  function execCalls() {
    return mockedExecFile.mock.calls.map((c) => ({ file: c[0], args: c[1], opts: c[2] }));
  }

  it('createNewChange passes an adversarial description as ONE literal argv element, unescaped', async () => {
    const description = 'desc $(touch /tmp/s5-pwn) `id` "quoted" ; rm -rf ~';
    await createNewChange(gitDir, 'my-change', 'spec-driven', description);

    const call = execCalls().find((c) => c.file === 'openspec');
    expect(call).toBeDefined();
    // Free-form description rides as ONE --description=<value> token: no shell
    // to reinterpret metacharacters, and a leading '-' in the text cannot be
    // re-read as a flag by openspec's option parser.
    expect(call!.args).toEqual([
      'new',
      'change',
      'my-change',
      '--schema',
      'spec-driven',
      `--description=${description}`,
    ]);
  });

  it('createNewChange omits --description when none is given', async () => {
    await createNewChange(gitDir, 'plain-change');

    const call = execCalls().find((c) => c.file === 'openspec');
    expect(call!.args).toEqual(['new', 'change', 'plain-change', '--schema', 'spec-driven']);
  });

  it('createLocalSchema passes artifacts as a single --artifacts argv element', async () => {
    await createLocalSchema(gitDir, 'custom-flow', ['proposal', 'tasks']);

    const call = execCalls().find((c) => c.file === 'openspec');
    expect(call!.args).toEqual([
      'schema',
      'init',
      'custom-flow',
      '--artifacts',
      'proposal,tasks',
      '--no-default',
    ]);
  });

  it.each([['proposal; rm -rf /'], ['a$(id)'], ['`id`'], ['a,b'], ['-evil'], ['']])(
    'createLocalSchema rejects malicious artifact %j before spawning',
    async (artifact) => {
      await expect(createLocalSchema(gitDir, 'custom-flow', [artifact])).rejects.toThrow(
        'Invalid artifact name format'
      );
      expect(execCalls().find((c) => c.file === 'openspec')).toBeUndefined();
    }
  );
});
