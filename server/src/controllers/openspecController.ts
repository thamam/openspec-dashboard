import { Request, Response } from 'express';
import { spawn } from 'child_process';
import { resolveProvider } from '../agents/ProviderResolver.js';
import { checkRepoStatus, resolvePath } from '../services/repoService.js';

// S2: shell metacharacters are rejected in args as defense-in-depth
// (spawns use shell:false, so these would be literal — but they should never
// reach a child process from this endpoint at all).
const SHELL_METACHAR_PATTERN = /[$`;&|<>()\n\r]/;

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

    // S2: args must be an array of plain strings without shell metacharacters
    const inputArgs: unknown[] = Array.isArray(args) ? args : [];
    if (inputArgs.some(a => typeof a !== 'string' || SHELL_METACHAR_PATTERN.test(a))) {
      res.status(400).json({ error: 'Invalid args: arguments must be plain strings without shell metacharacters' });
      return;
    }

    try {
      // S2: validate caller-supplied repoPath instead of trusting it as cwd
      let cwd: string;
      if (req.body.repoPath) {
        const resolvedRepoPath = resolvePath(String(req.body.repoPath));
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
      let execArgs = args || [];

      if (execCmd === 'ag' || execCmd === 'antigravity') {
        execCmd = 'agy';
      }

      if (execCmd === 'openspec') {
        execCmd = 'npx';
        execArgs = ['openspec', ...(args || [])];
      }

      if (command === 'tmux') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const sessionIndex = args ? args.indexOf('-t') : -1;
        const sessionName = sessionIndex !== -1 && args[sessionIndex + 1] ? args[sessionIndex + 1] : '';

        let tmuxArgs = args || [];
        if (args && args.includes('attach') && sessionName) {
          // Replace attach with capture-pane -pt for non-interactive streaming
          tmuxArgs = ['capture-pane', '-pt', sessionName];
        }

        const child = spawn('tmux', tmuxArgs, { cwd });
        child.stdout.on('data', (data) => res.write(data));
        child.stderr.on('data', (data) => res.write(data));
        child.on('close', (code) => {
          if (code !== 0 && sessionName) {
            res.write(`\n[tmux session '${sessionName}' is not running or has completed]`);
          }
          res.end(`\n[Process exited with code ${code}]`);
        });
        child.on('error', (err) => {
          res.write(`\nFailed to execute tmux: ${err.message}`);
          res.end();
        });
        return;
      }

      if (shellCommands.includes(command) && !lifecycleCommands.includes(command)) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        const child = spawn(execCmd, execArgs, { cwd });
        child.stdout.on('data', (data) => res.write(data));
        child.stderr.on('data', (data) => res.write(data));
        child.on('close', (code) => res.end(`\n[Process exited with code ${code}]`));
        child.on('error', (err) => {
          res.write(`\nFailed to start command '${execCmd}': ${err.message}`);
          res.end();
        });
        return;
      }

      if (command === 'opsx-new') {
        const rawName = args?.[0] || 'default';
        // Force the name to lowercase kebab-case to satisfy openspec CLI constraints
        const kebabName = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const child = spawn('npx', ['openspec', 'new', 'change', kebabName], { cwd });
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        child.stdout.on('data', (data) => res.write(data));
        child.stderr.on('data', (data) => res.write(data));
        child.on('close', (code) => res.end(`\n[Process exited with code ${code}]`));
        child.on('error', (err) => {
          res.write(`\nFailed to start subprocess: ${err.message}`);
          res.end();
        });
      } else if (command === 'opsx-verify') {
        const target = changeName || args?.[0] || 'main';
        const child = spawn('npx', ['openspec', 'status', '--change', target], { cwd });
        
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Transfer-Encoding', 'chunked');

        child.stdout.on('data', (data) => res.write(data));
        child.stderr.on('data', (data) => res.write(data));
        child.on('close', (code) => res.end(`\n[Process exited with code ${code}]`));
        child.on('error', (err) => {
          res.write(`\nFailed to start subprocess: ${err.message}`);
          res.end();
        });
      } else {
        // Resolve active provider dynamically
        const provider = resolveProvider(cwd, changeName || args?.[0]);
        
        // Execute the lifecycle command via the provider
        const processArgs = args || (changeName ? [changeName] : []);
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

export const openSpecController = new OpenSpecController();
