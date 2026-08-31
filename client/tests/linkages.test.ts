import { describe, it, expect } from 'vitest';
import { getConnectedSet } from '../src/components/ArtifactViewer/views/linkages.js';
import type { Linkage } from '../src/types.js';

// C10: unit tests for the extracted getConnectedSet shared by DashboardView and
// MatrixView. Both views rely on the same fuzzy-match semantics:
//  - case-insensitive substring match in EITHER direction
//  - both strings must be >= 5 chars (shorter strings never match)
//  - BFS expansion across linkages in both source->target and target->source
//  - fuzzy dedup: a candidate that fuzzily matches an already-connected member
//    is NOT re-added (the O(connected x linkages) inner guard)

describe('getConnectedSet (C10 shared linkage traversal)', () => {
  it('returns an empty set for a null seed', () => {
    expect(getConnectedSet(null, [{ source: 'Alpha Goal', target: 'Beta Task' }]).size).toBe(0);
  });

  it('returns an empty set for an empty-string seed', () => {
    expect(getConnectedSet('', [{ source: 'Alpha Goal', target: 'Beta Task' }]).size).toBe(0);
  });

  it('defaults linkages to empty and returns just the seed', () => {
    const connected = getConnectedSet('Alpha Goal');
    expect([...connected]).toEqual(['Alpha Goal']);
  });

  it('expands source -> target on a direct match', () => {
    const connected = getConnectedSet('Alpha Goal', [
      { source: 'Alpha Goal', target: 'Beta Task' },
    ]);
    expect(connected.has('Alpha Goal')).toBe(true);
    expect(connected.has('Beta Task')).toBe(true);
  });

  it('expands target -> source (bidirectional traversal)', () => {
    const connected = getConnectedSet('Beta Task', [
      { source: 'Alpha Goal', target: 'Beta Task' },
    ]);
    expect(connected.has('Alpha Goal')).toBe(true);
    expect(connected.has('Beta Task')).toBe(true);
  });

  it('matches case-insensitively', () => {
    const connected = getConnectedSet('user login flow', [
      { source: 'User Login Flow', target: 'Login Endpoint' },
    ]);
    expect(connected.has('Login Endpoint')).toBe(true);
  });

  it('matches on substring in either direction', () => {
    // seed is a substring of source
    const a = getConnectedSet('login flow', [
      { source: 'the user login flow page', target: 'Login Endpoint' },
    ]);
    expect(a.has('Login Endpoint')).toBe(true);
    // source is a substring of seed
    const b = getConnectedSet('the user login flow page', [
      { source: 'login flow', target: 'Login Endpoint' },
    ]);
    expect(b.has('Login Endpoint')).toBe(true);
  });

  it('never matches strings shorter than 5 chars, even when identical', () => {
    const connected = getConnectedSet('abc', [
      { source: 'abc', target: 'Beta Task' },
    ]);
    expect([...connected]).toEqual(['abc']);
  });

  it('expands transitively (BFS across hops)', () => {
    const connected = getConnectedSet('Alpha Goal', [
      { source: 'Alpha Goal', target: 'Beta Task' },
      { source: 'Beta Task', target: 'Gamma Design' },
    ]);
    expect(connected.has('Beta Task')).toBe(true);
    expect(connected.has('Gamma Design')).toBe(true);
  });

  it('leaves unrelated linkages out of the set', () => {
    const connected = getConnectedSet('Alpha Goal', [
      { source: 'Alpha Goal', target: 'Beta Task' },
      { source: 'Unrelated Thing', target: 'Other Thing' },
    ]);
    expect(connected.has('Unrelated Thing')).toBe(false);
    expect(connected.has('Other Thing')).toBe(false);
  });

  it('fuzzy-dedups candidates against already-connected members', () => {
    // 'Beta Task' is a fuzzy substring of 'beta task list', so the second
    // candidate must NOT be re-added even though the source matches.
    const connected = getConnectedSet('Alpha Goal', [
      { source: 'Alpha Goal', target: 'Beta Task' },
      { source: 'alpha goal', target: 'beta task list' },
    ]);
    expect(connected.has('Beta Task')).toBe(true);
    expect(connected.has('beta task list')).toBe(false);
    expect(connected.size).toBe(2);
  });

  it('returns a fresh Set on each call (no shared state)', () => {
    const linkages = [{ source: 'Alpha Goal', target: 'Beta Task' }];
    const a = getConnectedSet('Alpha Goal', linkages);
    const b = getConnectedSet('Alpha Goal', linkages);
    expect(a).not.toBe(b);
    expect([...a]).toEqual([...b]);
  });

  // Behavioral oracle: the extracted implementation must be observationally
  // identical to the legacy inline copies that lived in DashboardView.tsx and
  // MatrixView.tsx (verified character-identical before extraction).
  const legacyGetConnectedSet = (seed: string | null, linkages: Linkage[] = []) => {
    const connected = new Set<string>();
    if (!seed) return connected;

    const queue = [seed];
    connected.add(seed);

    const isMatch = (a: string, b: string) => {
      if (!a || !b || a.length < 5 || b.length < 5) return false;
      const lowA = a.toLowerCase();
      const lowB = b.toLowerCase();
      return lowA.includes(lowB) || lowB.includes(lowA);
    };

    while (queue.length > 0) {
      const curr = queue.shift()!;
      linkages.forEach(link => {
        if (isMatch(link.source, curr) && !Array.from(connected).some(c => isMatch(c, link.target))) {
          connected.add(link.target);
          queue.push(link.target);
        }
        if (isMatch(link.target, curr) && !Array.from(connected).some(c => isMatch(c, link.source))) {
          connected.add(link.source);
          queue.push(link.source);
        }
      });
    }
    return connected;
  };

  it('matches the legacy inline implementation across deterministic random graphs', () => {
    // Deterministic LCG so the oracle matrix is reproducible.
    let state = 42;
    const rand = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
    const vocab = [
      'Alpha Goal', 'Beta Task', 'Gamma Design', 'login flow', 'User Login',
      'abc', 'xy', '', 'Delta Spec', 'alpha goal', 'BETA TASK list',
    ];
    const pick = () => vocab[Math.floor(rand() * vocab.length)];

    for (let i = 0; i < 200; i++) {
      const linkages: Linkage[] = Array.from({ length: Math.floor(rand() * 6) }, () => ({
        source: pick(),
        target: pick(),
      }));
      const seed = rand() < 0.2 ? null : pick();
      const expected = [...legacyGetConnectedSet(seed, linkages)];
      const actual = [...getConnectedSet(seed, linkages)];
      expect(actual).toEqual(expected);
    }
  });
});
