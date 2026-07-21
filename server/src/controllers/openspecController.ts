import { Request, Response } from 'express';
import { spawn } from 'child_process';
import { resolveProvider } from '../agents/ProviderResolver.js';

export class OpenSpecController {
  
  /**
   * Executes a lifecycle command (e.g., opsx-continue) via child process.
   * In a full implementation, this would stream output to the client via WebSockets or SSE.
   * For V1 REST API, we return success/failure and optionally capture stdout.
   */
  public async executeCommand(req: Request, res: Response): Promise<void> {
    const { command, args, changeName } = req.body;
    
    // Whitelist allowed commands for security
    const allowedCommands = ['opsx-new', 'opsx-continue', 'opsx-propose', 'opsx-verify', 'opsx-archive', 'opsx-sync'];
    if (!allowedCommands.includes(command)) {
      res.status(400).json({ error: 'Command not allowed' });
      return;
    }

    try {
      const cwd = req.body.repoPath || process.env.REPO_PATH || process.cwd();

      if (command === 'opsx-new') {
        const rawName = args?.[0] || 'default';
        // Force the name to lowercase kebab-case to satisfy openspec CLI constraints
        const kebabName = rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const child = spawn('npx', ['openspec', 'new', 'change', kebabName], { cwd, shell: true });
        
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
        const child = spawn('npx', ['openspec', 'status', '--change', target], { cwd, shell: true });
        
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
