import pty from 'node-pty';
import { Server, Socket } from 'socket.io';
import os from 'os';

export class PtyService {
  private io: Server;
  private ptyProcesses: Map<string, pty.IPty> = new Map();

  constructor(io: Server) {
    this.io = io;
  }

  public init() {
    const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');

    this.io.on('connection', (socket: Socket) => {
      const cwd = process.env.REPO_PATH || process.cwd();
      let ptyProcess: pty.IPty;

      try {
        ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols: 100,
          rows: 30,
          cwd,
          env: process.env as { [key: string]: string }
        });
      } catch (e) {
        console.error('Failed to spawn PTY with shell:', shell, e);
        const fallbackShell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/sh';
        try {
          ptyProcess = pty.spawn(fallbackShell, [], {
            name: 'xterm-256color',
            cols: 100,
            rows: 30,
            cwd,
            env: process.env as { [key: string]: string }
          });
        } catch (fallbackErr) {
          console.error('Failed to spawn fallback PTY with shell:', fallbackShell, fallbackErr);
          socket.emit('terminal-data', '\r\n\x1b[31mFailed to spawn terminal process.\x1b[0m\r\n');
          return;
        }
      }

      this.ptyProcesses.set(socket.id, ptyProcess);

      ptyProcess.onData((data: string) => {
        socket.emit('terminal-data', data);
      });

      socket.on('terminal-input', (data: string) => {
        const proc = this.ptyProcesses.get(socket.id);
        if (proc) {
          proc.write(data);
        }
      });

      socket.on('terminal-resize', (size: { cols: number; rows: number }) => {
        const proc = this.ptyProcesses.get(socket.id);
        if (proc && size && size.cols > 0 && size.rows > 0) {
          try {
            proc.resize(size.cols, size.rows);
          } catch (err) {
            console.error('PTY resize error:', err);
          }
        }
      });

      socket.on('execute-command', (command: string) => {
        const proc = this.ptyProcesses.get(socket.id);
        if (proc) {
          proc.write(`${command}\r`);
        }
      });

      socket.on('disconnect', () => {
        const proc = this.ptyProcesses.get(socket.id);
        if (proc) {
          try {
            proc.kill();
          } catch (e) {}
          this.ptyProcesses.delete(socket.id);
        }
      });
    });
  }
}
