import { spawn } from 'child_process';
import { ExecutionStream } from './AgentProvider.js';
import { assertSafeName } from '../utils/paths.js';

// S13: shared tmux launcher for all agent providers (previously three
// near-identical spawnTmux bodies).
//
// The pre-fix code handed tmux ONE shell command string
// (`tmux new-session -d -s name "agy ... -p \"<prompt>\""`), which tmux
// executes via `sh -c` — so `"`, `$()` and backticks in socket-controlled
// prompts/workspace paths were evaluated by a shell. Verified live against
// tmux 3.6a: a `$(touch ...)` payload in the string form executed; the same
// payload in argv form did not.
//
// The fix passes the agent command as discrete argv elements after `--`:
//   tmux new-session -d -s <name> -- <agent> <args...>
// tmux execs a multi-argument command directly, without a shell, and `--`
// ends tmux's own option parsing so no payload can be re-read as a tmux flag.
// Callers must still route option VALUES that could lead with '-' as
// `--flag=<value>` single tokens for the AGENT's own option parser.
export function spawnTmuxSession(sessionName: string, agentArgv: string[], cwd: string): ExecutionStream {
  // Session names are derived (agent-<slug>, agent-task-<ts>) — validate
  // after derivation so a derivation change can never smuggle a tmux target.
  assertSafeName(sessionName, 'tmux session name');

  const child = spawn('tmux', ['new-session', '-d', '-s', sessionName, '--', ...agentArgv], { cwd });

  // Without a shell, a missing tmux binary raises 'error' (ENOENT) instead of
  // exiting 127 — an unhandled 'error' event would crash the server. Attach
  // immediately; forward to any onError callbacks registered later.
  const errorCallbacks: Array<(error: string) => void> = [];
  let spawnError: string | null = null;
  child.on('error', (err) => {
    spawnError = err.message;
    if (errorCallbacks.length === 0) {
      console.error(`[tmuxSession] Failed to spawn tmux: ${err.message}`);
    }
    for (const cb of errorCallbacks) cb(err.message);
  });

  return {
    process: child,
    onData: (callback) => {
      // Stream a friendly message detailing the tmux session name
      callback(`\n[Agent Delegation via Dashboard API]\nSuccessfully launched agent in a detached tmux session: ${sessionName}\n\nTo interact with the agent, open your terminal and run:\n\n    tmux attach -t ${sessionName}\n\n`);
      child.stdout.on('data', (data) => callback(data.toString()));
    },
    onError: (callback) => {
      errorCallbacks.push(callback);
      // Deliver a spawn error that fired before this callback registered.
      if (spawnError) callback(spawnError);
      child.stderr.on('data', (data) => callback(data.toString()));
    },
    // NOTE: the child is the `tmux new-session -d` LAUNCHER — it exits as
    // soon as the detached session is created, NOT when the agent finishes.
    onExit: (callback) => {
      child.on('close', (code) => callback(code));
    }
  };
}
