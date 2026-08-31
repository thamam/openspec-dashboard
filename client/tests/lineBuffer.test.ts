import { describe, it, expect } from 'vitest';
import { MAX_TERMINAL_LINES, appendTerminalLines, capTerminalLines } from '../src/terminal/lineBuffer';

describe('appendTerminalLines', () => {
  it('appends without trimming when under the cap', () => {
    expect(appendTerminalLines(['a', 'b'], ['c', 'd'], 10)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('caps at the limit and keeps the NEWEST lines', () => {
    const prev = Array.from({ length: 100 }, (_, i) => `line-${i}`);
    const added = Array.from({ length: 10 }, (_, i) => `new-${i}`);
    const result = appendTerminalLines(prev, added, 100);
    expect(result).toHaveLength(100);
    // The 10 oldest lines are dropped; the newest all survive in order.
    expect(result[0]).toBe('line-10');
    expect(result[99]).toBe('new-9');
    expect(result.slice(-10)).toEqual(added);
  });

  it('handles a single chunk larger than the cap by itself', () => {
    const added = Array.from({ length: 60 }, (_, i) => `chunk-${i}`);
    const result = appendTerminalLines(['old'], added, 50);
    expect(result).toHaveLength(50);
    expect(result).toEqual(added.slice(-50));
  });

  it('respects the default cap MAX_TERMINAL_LINES', () => {
    const prev = Array.from({ length: MAX_TERMINAL_LINES }, (_, i) => `p-${i}`);
    const added = Array.from({ length: 10 }, (_, i) => `a-${i}`);
    const result = appendTerminalLines(prev, added);
    expect(result).toHaveLength(MAX_TERMINAL_LINES);
    expect(result[0]).toBe('p-10');
    expect(result[MAX_TERMINAL_LINES - 1]).toBe('a-9');
  });

  it('does not mutate the input array', () => {
    const prev = ['a', 'b'];
    appendTerminalLines(prev, ['c'], 10);
    expect(prev).toEqual(['a', 'b']);
  });
});

describe('capTerminalLines', () => {
  it('returns the array unchanged when under the cap', () => {
    const lines = ['a', 'b'];
    expect(capTerminalLines(lines, 10)).toEqual(['a', 'b']);
  });

  it('keeps the newest N when over the cap', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `l-${i}`);
    const result = capTerminalLines(lines, 10);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe('l-2');
  });
});
