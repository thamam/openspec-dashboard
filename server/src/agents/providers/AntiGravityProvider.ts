import { spawn } from 'child_process';
import { IAgentProvider, ExecutionStream } from '../AgentProvider.js';

export class AntiGravityProvider implements IAgentProvider {
  
  public async executeLifecycle(command: string, args: string[], workspacePath: string): Promise<ExecutionStream> {
    const changeName = args[0] || 'default';
    const sessionName = `openspec-session-${Date.now()}`;
    
    let prompt = '';
    if (command === 'opsx-continue') {
      prompt = `Please follow the workflow instructions in .agent/workflows/opsx-continue.md to continue change ${changeName}`;
    } else if (command.startsWith('opsx-')) {
      prompt = `Please execute the OpenSpec workflow /${command} for change ${changeName} following the instructions in .agent/workflows/${command}.md`;
    } else {
      prompt = `Please run the OpenSpec command /${command} ${args.join(' ')}`;
    }

    const targetCommand = `agy --mode accept-edits --add-dir "${workspacePath}" -p "${prompt}" --dangerously-skip-permissions`;
    return this.spawnTmux(sessionName, targetCommand, workspacePath);
  }

  public async executeTask(taskContext: string, workspacePath: string): Promise<ExecutionStream> {
    const sessionName = `openspec-session-${Date.now()}`;
    const prompt = `Please complete the following task from the OpenSpec tasks.md:\n\n${taskContext}`;
    const targetCommand = `agy --mode accept-edits --add-dir "${workspacePath}" -p "${prompt}" --dangerously-skip-permissions`;
    
    return this.spawnTmux(sessionName, targetCommand, workspacePath);
  }

  private spawnTmux(sessionName: string, command: string, cwd: string): ExecutionStream {
    const child = spawn('tmux', ['new-session', '-d', '-s', sessionName, command], { cwd });

    return {
      process: child,
      onData: (callback) => {
        // Stream a friendly message detailing the tmux session name
        callback(`\n[Agent Delegation via Dashboard API]\nSuccessfully launched agent in a detached tmux session: ${sessionName}\n\nTo interact with the agent, open your terminal and run:\n\n    tmux attach -t ${sessionName}\n\n`);
        child.stdout.on('data', (data) => callback(data.toString()));
      },
      onError: (callback) => {
        child.stderr.on('data', (data) => callback(data.toString()));
      },
      onExit: (callback) => {
        child.on('close', (code) => callback(code));
      }
    };
  }
}
