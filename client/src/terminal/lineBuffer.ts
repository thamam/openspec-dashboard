// C7: bounded buffer for App.tsx's terminalLines state. The array only feeds
// agent-session detection now (TerminalPane is a live PTY and renders from
// xterm, which already owns a 10k-line scrollback buffer), so unbounded growth
// was a redundant slow memory leak plus a re-render per appended chunk.
//
// Cap = 2000 lines: ~20-60 full tmux pane captures (30-100 lines each) of
// context — far more than session detection needs (start/exit markers are
// always recent), while keeping the React state array and its re-render cost
// bounded. xterm's 10k scrollback remains the real rendered buffer.
export const MAX_TERMINAL_LINES = 2000;

// Append lines, keeping at most the newest `max` entries.
export function appendTerminalLines(prev: string[], added: string[], max: number = MAX_TERMINAL_LINES): string[] {
  const next = [...prev, ...added];
  return next.length > max ? next.slice(-max) : next;
}

// Cap an already-built array (e.g. captureTmuxPane's marker-splice rebuild).
export function capTerminalLines(lines: string[], max: number = MAX_TERMINAL_LINES): string[] {
  return lines.length > max ? lines.slice(-max) : lines;
}
