// C8: shared agent-session detection for the terminal pipeline. Previously the
// same backward regex scan was duplicated verbatim in TerminalPane/index.tsx
// and App.tsx (handleRunTerminalCommand), re-running over the WHOLE lines array
// on every chunk (O(n²) over a session). This module is the single source of
// truth; both call sites use it.

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

// Incremental variant: feed only new lines as they arrive; O(new lines) per
// update instead of rescanning the whole buffer. feedLines() accepts the FULL
// (capped) lines array and internally skips what it has already processed, so
// callers never have to diff chunks themselves.
export class SessionDetector {
  private fed = 0;
  private lastLine: string | undefined = undefined;
  private candidate = '';
  private exited = false;

  get activeSession(): string {
    return this.exited ? '' : this.candidate;
  }

  reset(): void {
    this.fed = 0;
    this.lastLine = undefined;
    this.candidate = '';
    this.exited = false;
  }

  // Feed the full lines array; returns the current active session.
  // Resets automatically when the buffer was cleared (shrank) or when its
  // already-fed tail was spliced in place (pane capture replaces from the
  // "--- Active Session ---" marker onward — detected via a last-line
  // fingerprint). The fingerprint only guards the same-length splice corner;
  // growth is the common path and is processed purely incrementally.
  feedLines(lines: string[]): string {
    if (
      lines.length < this.fed ||
      (this.fed > 0 && lines[this.fed - 1] !== this.lastLine)
    ) {
      this.reset();
    }
    for (let i = this.fed; i < lines.length; i++) {
      this.feedLine(lines[i]);
    }
    this.fed = lines.length;
    this.lastLine = this.fed > 0 ? lines[this.fed - 1] : undefined;
    return this.activeSession;
  }

  // Feed genuinely NEW lines (chunks as they arrive), one or a few at a time.
  // Use this OR feedLines — not both; feed() assumes every line passed here is
  // appended to the stream, so it never triggers the splice/shrink reset.
  feed(line: string): string {
    this.feedLine(line);
    this.fed++;
    this.lastLine = line;
    return this.activeSession;
  }

  private feedLine(line: string): void {
    const match = line.match(AGENT_SESSION_PATTERN);
    if (match) {
      this.candidate = match[0];
      this.exited = false;
    } else if (line.includes(EXIT_MARKER)) {
      this.exited = true;
    }
  }
}
