import { spawn } from 'child_process';
import { IAgentProvider, ExecutionStream } from '../AgentProvider.js';

export class AntiGravityProvider implements IAgentProvider {
  
  public async executeLifecycle(command: string, args: string[], workspacePath: string): Promise<ExecutionStream> {
    // We execute the OpenSpec CLI directly. If it requires an agent, 
    // it will invoke the local AntiGravity agent automatically.
    return this.spawnProcess(command, args, workspacePath);
  }

  public async executeTask(taskContext: string, workspacePath: string): Promise<ExecutionStream> {
    // To execute a specific task, we call the `agy run` command with the task context as the prompt.
    // This allows AntiGravity to run autonomously on the specific task.
    const prompt = `Please complete the following task from the OpenSpec tasks.md:\n\n${taskContext}`;
    
    return this.spawnProcess('agy', ['run', prompt], workspacePath);
  }

  private spawnProcess(command: string, args: string[], cwd: string): ExecutionStream {
    const child = spawn(command, args, { cwd, shell: true });

    return {
      process: child,
      onData: (callback) => {
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
