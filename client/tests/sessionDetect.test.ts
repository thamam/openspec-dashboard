import { describe, it, expect } from 'vitest';
import {
  AGENT_SESSION_PATTERN,
  EXIT_MARKER,
  detectActiveSession
} from '../src/terminal/sessionDetect';

// Reference oracle: the legacy inline scan previously duplicated verbatim in
// TerminalPane/index.tsx:48-67 and App.tsx (handleRunTerminalCommand). Kept here
// so the shared helper can never drift from the behavior both call sites had.
function legacyDetect(lines: string[]): string {
  let sessionName = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(/(openspec-session-[0-9]+|agent-[0-9]+)/);
    if (match) {
      let exited = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].includes('[Process exited with code')) {
          exited = true;
          break;
        }
      }
      if (!exited) {
        sessionName = match[0];
      }
      break;
    }
  }
  return sessionName;
}

describe('detectActiveSession (batch)', () => {
  it('returns empty string when no session line exists', () => {
    expect(detectActiveSession([])).toBe('');
    expect(detectActiveSession(['$ ls', 'file.txt', 'some output'])).toBe('');
  });

  it('detects an openspec-session-N start line', () => {
    expect(detectActiveSession(['$ run agent', 'started openspec-session-123'])).toBe('openspec-session-123');
  });

  it('detects an agent-N session line', () => {
    expect(detectActiveSession(['tmux new-session -s agent-456'])).toBe('agent-456');
  });

  it('returns empty when an exit marker appears after the last session line', () => {
    const lines = [
      'started openspec-session-123',
      'doing work',
      '[Process exited with code 0]'
    ];
    expect(detectActiveSession(lines)).toBe('');
  });

  it('a later session start supersedes an earlier exited session', () => {
    const lines = [
      'started openspec-session-123',
      '[Process exited with code 0]',
      'started agent-789',
      'working...'
    ];
    expect(detectActiveSession(lines)).toBe('agent-789');
  });

  it('picks the last matching line when multiple sessions appear', () => {
    const lines = [
      'started openspec-session-123',
      'started openspec-session-124'
    ];
    expect(detectActiveSession(lines)).toBe('openspec-session-124');
  });

  it('an exit marker on the SAME line as the session match does not count (legacy semantics)', () => {
    // The legacy inner scan starts at i+1, so an exit marker sharing the
    // match's own line is ignored.
    const lines = ['agent-42 [Process exited with code 1]'];
    expect(detectActiveSession(lines)).toBe('agent-42');
  });

  it('an exit marker before the last match is irrelevant', () => {
    const lines = [
      '[Process exited with code 0]',
      'started agent-99'
    ];
    expect(detectActiveSession(lines)).toBe('agent-99');
  });

  it('matches the legacy oracle across a matrix of scenarios', () => {
    const scenarios: string[][] = [
      [],
      ['noise'],
      ['agent-1'],
      ['agent-1', '[Process exited with code 0]'],
      ['[Process exited with code 0]', 'agent-1'],
      ['agent-1', '[Process exited with code 1]', 'openspec-session-2'],
      ['openspec-session-2', 'agent-3', '[Process exited with code 0]'],
      ['a agent-9 b', 'c', 'd [Process exited with code 2]', 'e'],
    ];
    for (const lines of scenarios) {
      expect(detectActiveSession(lines)).toBe(legacyDetect(lines));
    }
  });
});

// NOTE: an incremental SessionDetector class was implemented first and removed
// in review — its reset heuristic couldn't see prefix rewrites, and with the
// C7 cap a full scan is bounded O(MAX_TERMINAL_LINES) over an array that only
// changes on user commands. The batch helper above is the single shared scan.

describe('exported constants', () => {
  it('AGENT_SESSION_PATTERN and EXIT_MARKER match the legacy literals', () => {
    expect('x openspec-session-12 y'.match(AGENT_SESSION_PATTERN)?.[0]).toBe('openspec-session-12');
    expect('x agent-12 y'.match(AGENT_SESSION_PATTERN)?.[0]).toBe('agent-12');
    expect(EXIT_MARKER).toBe('[Process exited with code');
  });
});
