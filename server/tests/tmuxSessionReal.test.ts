import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnTmuxSession } from '../src/agents/tmuxSession.js';

// Real-binary verification for S13 (no mocks — drives the actual tmux).
// Cycle 7 manual probe against tmux 3.6a established:
//   string form:  tmux new-session -d -s n 'printf "%s" "x$(touch PWN)y"'  -> PWN CREATED (shell)
//   argv form:    tmux new-session -d -s n -- printf %s 'x$(touch PWN)y'   -> no PWN (direct exec)
// spawnTmuxSession must use the argv form.

const hasTmux = (() => {
  try { execFileSync('tmux', ['-V']); return true; } catch { return false; }
})();
const itTmux = hasTmux ? it : it.skip;

describe('spawnTmuxSession — real tmux (S13)', () => {
  itTmux('hostile payload in agent argv stays literal — tmux runs no shell', async () => {
    const stamp = Date.now();
    const session = `s13-real-${stamp}`;
    const control = path.join(os.tmpdir(), `s13-real-control-${stamp}`);
    const pwn = path.join(os.tmpdir(), `s13-real-pwn-${stamp}`);

    try {
      // Control: argv form actually executes the program.
      const s1 = spawnTmuxSession(`${session}-ctrl`, ['touch', control], os.tmpdir());
      await new Promise((r) => setTimeout(r, 1200));
      expect(fs.existsSync(control)).toBe(true);
      expect(s1.process).toBeDefined();

      // Injection: `$(...)` inside an argv element must NOT be evaluated.
      spawnTmuxSession(session, ['printf', '%s', `x$(touch ${pwn})y`], os.tmpdir());
      await new Promise((r) => setTimeout(r, 1200));
      expect(fs.existsSync(pwn)).toBe(false);
    } finally {
      for (const s of [`${session}-ctrl`, session]) {
        try { execFileSync('tmux', ['kill-session', '-t', s]); } catch { /* already exited */ }
      }
      for (const f of [control, pwn]) {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    }
  }, 15000);

  itTmux('rejects an unsafe session name without spawning', () => {
    expect(() => spawnTmuxSession('bad;$(touch /tmp/x)', ['printf', 'x'], os.tmpdir())).toThrow(/session name/i);
  });

  it('rejects a single-element agent argv — tmux would run it via sh -c', () => {
    // No tmux needed: the guard fires before spawn.
    expect(() => spawnTmuxSession('ok-name', ['echo hi'], os.tmpdir())).toThrow(/sh -c|at least 2/i);
  });
});
