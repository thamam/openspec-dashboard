import { describe, it, expect } from 'vitest';
import { buildPostCreateSearch } from '../src/App.js';

// C6: create-change success reloads via `window.location.search = ...`.
// Pre-fix it REPLACED the query string with only ?change=&path=, dropping the
// Keystone pin params (?project=/?sha=) — the pinned Deck context and drift
// badge vanished after creating a change. The fix merges into the existing
// params instead of replacing them.

describe('buildPostCreateSearch (C6)', () => {
  it('preserves the Keystone pin params (project, sha) while setting change and path', () => {
    const search = buildPostCreateSearch('?project=keystone&sha=abc123&path=/tmp/repo', 'my-change', '/tmp/repo');
    const params = new URLSearchParams(search);
    expect(params.get('project')).toBe('keystone');
    expect(params.get('sha')).toBe('abc123');
    expect(params.get('change')).toBe('my-change');
    expect(params.get('path')).toBe('/tmp/repo');
  });

  it('works when the current URL has no params', () => {
    const params = new URLSearchParams(buildPostCreateSearch('', 'my-change', '/tmp/repo'));
    expect(params.get('change')).toBe('my-change');
    expect(params.get('path')).toBe('/tmp/repo');
  });

  it('overwrites a stale change param but keeps everything else', () => {
    const params = new URLSearchParams(
      buildPostCreateSearch('?change=old-change&project=keystone', 'new-change', '/tmp/repo')
    );
    expect(params.get('change')).toBe('new-change');
    expect(params.get('project')).toBe('keystone');
  });

  it('URL-encodes special characters in change name and path', () => {
    const params = new URLSearchParams(
      buildPostCreateSearch('?project=keystone', 'add auth & login', '/tmp/my repo')
    );
    expect(params.get('change')).toBe('add auth & login');
    expect(params.get('path')).toBe('/tmp/my repo');
  });
});
