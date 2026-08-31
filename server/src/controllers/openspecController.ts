import { Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import { resolveProvider } from '../agents/ProviderResolver.js';
import { checkRepoStatus, resolvePath } from '../services/repoService.js';
import { SHELL_METACHAR_PATTERN } from '../utils/paths.js';

// S2: shell metacharacters are rejected in args/changeName as defense-in-depth
// (spawns use shell:false, so these would be literal — but they should never
// reach a child process from this endpoint at all; quotes are also rejected
// because providers embed lifecycle args into a quoted tmux shell string).
// The pattern lives in utils/paths.ts, shared with the socket surface.

// Pipes a spawned child's output into the response and ends it exactly once.
// With shell:false a spawn 'error' (binary missing) is reachable, and Node
// still emits 'close' afterwards — the settled flag prevents writing to /
// ending an already-finished response.
function streamChildProcess(
  child: ChildProcess,
  res: Response,
  errorPrefix: string,
  onCloseExtra?: (code: number | null) => string,
): void {
  let settled = false;
  child.stdout?.on('data', (data) => res.write(data));
  child.stderr?.on('data', (data) => res.write(data));
  child.on('close', (code) => {
    if (settled) return;
    settled = true;
    const extra = onCloseExtra?.(code);
    if (extra) res.write(extra);
    res.end(`\n[Process exited with code ${code}]`);
  });
  child.on('error', (err) => {
    if (settled) return;
    settled = true;
    res.write(`\n${errorPrefix}: ${err.message}`);
    res.end();
  });
}

export class OpenSpecController {
  /**
   * Executes a lifecycle command (e.g., opsx-continue) via child process.
   * In a full implementation, this would stream output to the client via WebSockets or SSE.
   * For V1 REST API, we return success/failure and optionally capture stdout.
   */
  public async executeCommand(req: Request, res: Response): Promise<void> {
    const { command, args, changeName } = req.body;

    const lifecycleCommands = ['opsx-new', 'opsx-continue', 'opsx-propose', 'opsx-verify', 'opsx-archive', 'opsx-sync', 'opsx-apply'];
    const shellCommands = ['agy', 'ag', 'antigravity', 'claude', 'tmux', 'git', 'openspec', 'ls', 'pwd', 'cat', 'echo', 'which', 'clear', 'mkdir', 'touch'];

    if (!lifecycleCommands.includes(command) && !shellCommands.includes(command)) {
      res.status(400).json({ error: `Command '${command}' not allowed` });
      return;
    }

    // S2: args must be an array of plain strings without shell metacharacters.
    // A non-array object would be treated by Node's spawn as the options
    // argument, silently overriding the validated cwd — reject it outright.
    if (args !== undefined && args !== null) {
      if (!Array.isArray(args) || args.some(a => typeof a !== 'string' || SHELL_METACHAR_PATTERN.test(a))) {
        res.status(400).json({ error: 'Invalid args: arguments must be plain strings without shell metacharacters' });
        return;
      }
    }
    // S2: changeName flows into provider lifecycle commands (which build tmux
    // shell strings), so it gets the same guard.
    if (changeName !== undefined && changeName !== null) {
      if (typeof changeName !== 'string' || SHELL_METACHAR_PATTERN.test(changeName)) {
        res.status(400).json({ error: 'Invalid changeName: must be a plain string without shell metacharacters' });
        return;
      }
    }
    const safeArgs: string[] = Array.isArray(args) ? args : [];

    try {
      // S2: validate caller-supplied repoPath instead of trusting it as cwd.
      // Metacharacters are rejected too: providers embed the cwd in a quoted
      // tmux shell string (e.g. AntiGravityProvider's --add-dir "${cwd}").
      let cwd: string;
      if (req.body.repoPath) {
        if (typeof req.body.repoPath !== 'string' || SHELL_METACHAR_PATTERN.test(req.body.repoPath)) {
          res.status(400).json({ error: 'Invalid repoPath: must be a plain string without shell metacharacters' });
          return;
        }
        const resolvedRepoPath = resolvePath(req.body.repoPath);
        const status = await checkRepoStatus(resolvedRepoPath);
        if (!status?.exists || !status.isGit) {
          res.status(400).json({ error: 'repoPath is not a valid Git repository' });
          return;
        }
        cwd = resolvedRepoPath;
      } else {
        cwd = process.env.REPO_PATH || process.cwd();
      }

      // Normalize command aliases
      let execCmd = command;
      let execArgs: string[] = safeArgs;

      if (execCmd === 'ag' || execCmd === 'antigravity') {
        execCmd = 'agy';
      }

      if (execCmd === 'openspec') {
        execCmd = 'npx';
        execArgs = ['openspec', ...safeArgs];
      }

      if (command === 'tmux') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const sessionIndex = safeArgs.indexOf('-t');
        const sessionName = sessionIndex !== -1 && safeArgs[sessionIndex + 1] ? safeArgs[sessionIndex + 1] : '';

        let tmuxArgs = safeArgs;
        if (safeArgs.includes('attach') && sessionName) {
          // Replace attach with capture-pane -pt for non-interactive streaming
          tmuxArgs = ['capture-pane', '-pt', sessionName];
        }

        streamChildProcess(
          spawn('tmux', tmuxArgs, { cwd }),
          res,
          'Failed to execute tmux',
          (code) => code !== 0 && sessionName
            ? `\n[tmux session '${sessionName}' is not running or has completed]`
            : '',
        );
        return;
      }

      if (shellCommands.includes(command) && !lifecycleCommands.includes(command)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        streamChildProcess(
          spawn(execCmd, execArgs, { cwd }),
          res,
          `Failed to start command '${execCmd}'`,
        );
        return;
      }

      if (command === 'opsx-new') {
        const rawName = safeArgs[0] || 'default';
        // Force the name to lowercase kebab-case to satisfy openspec CLI constraints
        const kebabName = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        streamChildProcess(
          spawn('npx', ['openspec', 'new', 'change', kebabName], { cwd }),
          res,
          'Failed to start subprocess',
        );
      } else if (command === 'opsx-verify') {
        const target = changeName || safeArgs[0] || 'main';

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        streamChildProcess(
          spawn('npx', ['openspec', 'status', '--change', target], { cwd }),
          res,
          'Failed to start subprocess',
        );
      } else {
        // Resolve active provider dynamically
        const provider = resolveProvider(cwd, changeName || safeArgs[0]);

        // Execute the lifecycle command via the provider
        const processArgs = args ? safeArgs : (changeName ? [changeName] : []);
        const stream = await provider.executeLifecycle(command, processArgs, cwd);

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        stream.onData((data) => res.write(data));
        stream.onError((data) => res.write(data));
        stream.onExit((code) => res.end(`\n[Process exited with code ${code}]`));
      }

    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}
