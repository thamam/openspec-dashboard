import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { isSafeName, assertSafeName, resolveUnder, resolveUnderReal } from '../src/utils/paths.js';

describe('utils/paths — isSafeName', () => {
  it.each(['add-login', 'fix_123', 'v1.2.3', 'ChangeABC'])('accepts legit name %s', (name) => {
    expect(isSafeName(name)).toBe(true);
  });

  it.each([
    ['../../../etc', 'dot-dot slashes'],
    ['..', 'bare dot-dot'],
    ['.', 'bare dot'],
    ['/etc/passwd', 'absolute path'],
    ['a/b', 'embedded separator'],
    ['..\\..\\x', 'backslash traversal'],
    ['-rf', 'leading dash'],
    ['', 'empty string'],
    ['a b', 'space'],
    ['a;rm -rf /', 'shell metachar'],
  ])('rejects %s (%s)', (name) => {
    expect(isSafeName(name)).toBe(false);
  });

  it.each([[null], [undefined], [42], [['x']], [{}]])(
    'rejects non-string %s without coercion',
    (value) => {
      expect(isSafeName(value)).toBe(false);
    }
  );
});

describe('utils/paths — assertSafeName', () => {
  it('returns undefined and narrows for safe names', () => {
    expect(() => assertSafeName('add-login', 'change name')).not.toThrow();
  });

  it('throws with the label and value for unsafe names', () => {
    expect(() => assertSafeName('../../x', 'change name')).toThrow(/Invalid change name/);
  });
});

describe('utils/paths — resolveUnder', () => {
  const root = path.join(os.tmpdir(), 'resolve-under-root');

  it('resolves legit nested relative paths under the root', () => {
    expect(resolveUnder(root, '.aidev/artifacts/review.json')).toBe(
      path.join(root, '.aidev', 'artifacts', 'review.json')
    );
    expect(resolveUnder(root, 'specs/auth/spec.md')).toBe(
      path.join(root, 'specs', 'auth', 'spec.md')
    );
  });

  it.each([
    ['../escape.json', 'one level up'],
    ['../../../../etc/passwd', 'many levels up'],
    ['/etc/passwd', 'absolute path overrides root'],
    ['a/../../escape.json', 'mid-path escape'],
    ['', 'empty string'],
  ])('returns null for %s (%s)', (rel) => {
    expect(resolveUnder(root, rel)).toBeNull();
  });

  it.each([[null], [undefined], [42], [{}]])('returns null for non-string %s', (value) => {
    expect(resolveUnder(root, value)).toBeNull();
  });

  it('does not confuse a sibling prefix (root2) with containment', () => {
    expect(resolveUnder(root, '../resolve-under-root2/evil.json')).toBeNull();
  });
});

describe('utils/paths — resolveUnderReal (symlink-aware write containment)', () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-real-root-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-real-outside-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('resolves an existing in-repo file to its canonical path', () => {
    const target = path.join(root, 'file.md');
    fs.writeFileSync(target, 'x');
    expect(resolveUnderReal(root, 'file.md')).toBe(fs.realpathSync(target));
  });

  it('resolves a not-yet-existing nested target via its nearest existing ancestor', () => {
    expect(resolveUnderReal(root, 'new-dir/new-file.md')).toBe(
      path.join(fs.realpathSync(root), 'new-dir', 'new-file.md')
    );
  });

  it('rejects a symlink inside the repo that points outside', () => {
    fs.symlinkSync(outside, path.join(root, 'link'));
    expect(resolveUnderReal(root, 'link/pwn.md')).toBeNull();
  });

  it('accepts a symlink that stays inside the repo', () => {
    const inner = path.join(root, 'inner');
    fs.mkdirSync(inner);
    fs.symlinkSync(inner, path.join(root, 'alias'));
    expect(resolveUnderReal(root, 'alias/file.md')).toBe(
      path.join(fs.realpathSync(inner), 'file.md')
    );
  });

  it('rejects an absolute path outside the repo', () => {
    expect(resolveUnderReal(root, path.join(outside, 'pwn.md'))).toBeNull();
  });

  it('rejects when the root does not exist', () => {
    expect(resolveUnderReal(path.join(root, 'missing'), 'file.md')).toBeNull();
  });
});

// Regression for review pass 2: existsSync follows symlinks, so a DANGLING
// symlink looked non-existent and the ancestor walk skipped past it —
// writeFileSync would then follow the link and create the outside target.
describe('utils/paths — resolveUnderReal dangling symlink', () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-real-root-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-real-outside-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('rejects a write path through a dangling symlink pointing outside', () => {
    fs.symlinkSync(path.join(outside, 'does-not-exist-yet'), path.join(root, 'link'));
    expect(resolveUnderReal(root, 'link/pwn.md')).toBeNull();
    // And the outside target was not created as a side effect.
    expect(fs.existsSync(path.join(outside, 'does-not-exist-yet'))).toBe(false);
  });

  it('rejects when the target itself is a dangling symlink outside', () => {
    fs.symlinkSync(path.join(outside, 'pwn.md'), path.join(root, 'pwn.md'));
    expect(resolveUnderReal(root, 'pwn.md')).toBeNull();
  });
});
