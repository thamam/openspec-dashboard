import { describe, it, expect } from 'vitest';
import {
  AGENT_SESSION_PATTERN,
  EXIT_MARKER,
  detectActiveSession,
  SessionDetector
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

describe('SessionDetector (incremental)', () => {
  it('feeding line-by-line equals feeding all at once equals batch', () => {
    const lines = [
      'noise',
      'started openspec-session-123',
      'working',
      '[Process exited with code 0]',
      'started agent-789',
      'more work'
    ];
    const batch = detectActiveSession(lines);

    const allAtOnce = new SessionDetector();
    expect(allAtOnce.feedLines(lines)).toBe(batch);

    const lineByLine = new SessionDetector();
    let result = '';
    for (const line of lines) {
      result = lineByLine.feed(line);
    }
    expect(result).toBe(batch);
    expect(lineByLine.activeSession).toBe('agent-789');
  });

  it('only processes new lines across successive feedLines calls', () => {
    const d = new SessionDetector();
    expect(d.feedLines(['noise', 'started agent-1'])).toBe('agent-1');
    // Feed the grown array (old prefix + new lines) — prefix must not be reprocessed.
    expect(d.feedLines(['noise', 'started agent-1', '[Process exited with code 0]'])).toBe('');
    expect(d.feedLines(['noise', 'started agent-1', '[Process exited with code 0]', 'started agent-2'])).toBe('agent-2');
  });

  it('resets when the lines array shrinks (terminal cleared)', () => {
    const d = new SessionDetector();
    expect(d.feedLines(['started agent-1', 'working'])).toBe('agent-1');
    // 'clear' empties the array; next lines must be evaluated fresh.
    expect(d.feedLines([])).toBe('');
    expect(d.feedLines(['no session here'])).toBe('');
    expect(d.feedLines(['no session here', 'started agent-7'])).toBe('agent-7');
  });

  it('re-processes when a same-length array replaces the fed tail (pane capture splice)', () => {
    const d = new SessionDetector();
    expect(d.feedLines(['--- Active Session: agent-1 ---', 'pane line A'])).toBe('agent-1');
    // captureTmuxPane replaces from the marker onward; if the tail changes
    // without growing, the detector must notice via the last-line fingerprint.
    expect(d.feedLines(['--- Active Session: agent-1 ---', '[Process exited with code 0]'])).toBe('');
  });
});

describe('exported constants', () => {
  it('AGENT_SESSION_PATTERN and EXIT_MARKER match the legacy literals', () => {
    expect('x openspec-session-12 y'.match(AGENT_SESSION_PATTERN)?.[0]).toBe('openspec-session-12');
    expect('x agent-12 y'.match(AGENT_SESSION_PATTERN)?.[0]).toBe('agent-12');
    expect(EXIT_MARKER).toBe('[Process exited with code');
  });
});
