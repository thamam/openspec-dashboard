import { IAgentProvider, ExecutionStream } from '../AgentProvider.js';
import { spawnTmuxSession } from '../tmuxSession.js';

export class AntiGravityProvider implements IAgentProvider {
  
  public async executeLifecycle(command: string, args: string[], workspacePath: string): Promise<ExecutionStream> {
    const changeName = (args[0] || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const sessionName = `agent-${changeName}`;
    
    let prompt = '';
    if (command === 'opsx-continue') {
      prompt = `Please follow the workflow instructions in .agent/workflows/opsx-continue.md to continue change ${changeName}`;
    } else if (command.startsWith('opsx-')) {
      prompt = `Please execute the OpenSpec workflow /${command} for change ${changeName} following the instructions in .agent/workflows/${command}.md`;
    } else {
      prompt = `Please run the OpenSpec command /${command} ${args.join(' ')}`;
    }

    return spawnTmuxSession(sessionName, this.agyArgv(workspacePath, prompt), workspacePath);
  }

  public async executeTask(taskContext: string, workspacePath: string): Promise<ExecutionStream> {
    const sessionName = `agent-task-${Date.now()}`;
    const prompt = `Please complete the following task from the OpenSpec tasks.md:\n\n${taskContext}`;
    
    return spawnTmuxSession(sessionName, this.agyArgv(workspacePath, prompt), workspacePath);
  }

  // workspacePath is socket-controlled (set_repo_path): it rides as a single
  // --add-dir=<value> token (agy is Go-flag style and accepts '='), so a value
  // leading with '-' can never be re-read as a flag. The prompt is always
  // 'Please ...'-prefixed, so the -p value can never lead with '-' either.
  private agyArgv(workspacePath: string, prompt: string): string[] {
    return ['agy', '--mode', 'accept-edits', `--add-dir=${workspacePath}`, '-p', prompt, '--dangerously-skip-permissions'];
  }
}
