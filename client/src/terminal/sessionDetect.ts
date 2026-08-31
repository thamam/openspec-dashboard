// C8: shared agent-session detection for the terminal pipeline. Previously the
// same backward regex scan was duplicated verbatim in TerminalPane/index.tsx
// and App.tsx (handleRunTerminalCommand), re-running over the WHOLE lines array
// on every chunk (O(n²) over a session). This module is the single source of
// truth; both call sites use it.
//
// Note: an incremental SessionDetector class was considered and dropped in
// review — once C7 caps the buffer at MAX_TERMINAL_LINES, a full scan is a
// bounded O(2000) that only runs when the user executes a command (PTY output
// goes straight to xterm, never into this array), and front-trimming at the
// cap would have invalidated any incrementality anyway.

export const AGENT_SESSION_PATTERN = /(openspec-session-[0-9]+|agent-[0-9]+)/;
export const EXIT_MARKER = '[Process exited with code';

// Batch scan, semantics identical to the legacy inline loops: find the LAST
// line matching the session pattern; if any line AFTER it carries an exit
// marker, the session is considered gone. An exit marker sharing the match's
// own line does not count (the legacy inner scan started at i+1).
export function detectActiveSession(lines: string[]): string {
  let sessionName = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    const match = lines[i].match(AGENT_SESSION_PATTERN);
    if (match) {
      let exited = false;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].includes(EXIT_MARKER)) {
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
