import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import { isSafeName, assertSafeName, resolveUnder } from '../src/utils/paths.js';

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
