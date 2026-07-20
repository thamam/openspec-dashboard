import { Request, Response } from 'express';
import { spawn } from 'child_process';
import path from 'path';

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
      // In a real implementation, this would trigger the AgentProvider
      // For basic CLI execution, we spawn it here.
      const processArgs = changeName ? [changeName, ...(args || [])] : (args || []);
      
      const child = spawn(command, processArgs, {
        cwd: process.env.REPO_PATH || process.cwd(),
        shell: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          res.status(200).json({ success: true, stdout });
        } else {
          res.status(500).json({ success: false, error: stderr || stdout, code });
        }
      });

    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}

export const openSpecController = new OpenSpecController();
