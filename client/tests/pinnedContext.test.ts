import { describe, it, expect } from 'vitest';
import { isDrifted, readPinnedContext, toProjectIdFromSegment } from '../src/keystone/pinnedContext';

const PINNED = 'ab12f3e9c04d1b76e5f2a8d3c9b0e14f7a6d5c3b';

describe('keystone pinnedContext (CHROME.md v0.2 §1)', () => {
  it('returns null when the tab was opened without Deck context', () => {
    expect(readPinnedContext('')).toBeNull();
    expect(readPinnedContext('?change=add-scheduler-recovery')).toBeNull();
  });

  it('pins project and sha from the URL', () => {
    const pin = readPinnedContext('?project=code-to-spec-mut&sha=ab12f3e');
    expect(pin).toEqual({ project: 'code-to-spec-mut', sha: 'ab12f3e' });
  });

  it('accepts the path alias this dashboard predates project with', () => {
    const pin = readPinnedContext('?path=/Users/doc/personal/repos/code-to-spec-mut');
    expect(pin).toEqual({ project: 'code-to-spec-mut', sha: undefined });
  });

  it('normalizes a trailing slash and mixed case to the manifest id shape', () => {
    expect(toProjectIdFromSegment('/Users/doc/repos/My-Code-Review-Assistant/')).toBe('my-code-review-assistant');
    expect(toProjectIdFromSegment('thamam/code-to-spec-mut')).toBe('code-to-spec-mut');
  });

  it('does not drift while the selection still matches the pin', () => {
    const pin = { project: 'code-to-spec-mut', sha: 'ab12f3e' };
    expect(isDrifted(pin, { repo: '/Users/doc/repos/code-to-spec-mut', headSha: PINNED })).toBe(false);
  });

  it('drifts when the workspace selection leaves the pinned project', () => {
    const pin = { project: 'code-to-spec-mut', sha: 'ab12f3e' };
    expect(isDrifted(pin, { repo: '/Users/doc/repos/keystone', headSha: PINNED })).toBe(true);
  });

  it('drifts when HEAD no longer starts with the pinned sha', () => {
    const pin = { project: 'code-to-spec-mut', sha: 'ab12f3e' };
    expect(isDrifted(pin, { repo: '/Users/doc/repos/code-to-spec-mut', headSha: '9911c2d4f8e7a6b5c4d3e2f1a0b9c8d7e6f5a4b3' })).toBe(true);
  });

  it('treats an unknown current value as no evidence of drift, not as drift', () => {
    const pin = { project: 'code-to-spec-mut', sha: 'ab12f3e' };
    expect(isDrifted(pin, { repo: '/Users/doc/repos/code-to-spec-mut', headSha: null })).toBe(false);
    expect(isDrifted(pin, {})).toBe(false);
  });
});
