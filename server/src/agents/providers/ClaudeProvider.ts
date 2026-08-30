import { IAgentProvider, ExecutionStream } from '../AgentProvider.js';
import { spawnTmuxSession } from '../tmuxSession.js';

export class ClaudeProvider implements IAgentProvider {
  
  public async executeLifecycle(command: string, args: string[], workspacePath: string): Promise<ExecutionStream> {
    const changeName = (args[0] || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const sessionName = `agent-${changeName}`;
    
    let instruction = '';
    if (command === 'opsx-continue') {
      instruction = `Please follow the workflow instructions in .agent/workflows/opsx-continue.md to continue change ${changeName}`;
    } else {
      instruction = `Please run the OpenSpec command /${command} ${args.join(' ')}`;
    }
    
    // argv form (no shell): the instruction is one literal positional element.
    // It always carries the 'Please ...' prefix, so it can never be re-read
    // as a leading-dash flag by claude's own option parser.
    return spawnTmuxSession(sessionName, ['claude', '--permission-mode', 'auto', instruction], workspacePath);
  }

  public async executeTask(taskContext: string, workspacePath: string): Promise<ExecutionStream> {
    const sessionName = `agent-task-${Date.now()}`;
    const prompt = `Please complete the following task from the OpenSpec tasks.md:\n\n${taskContext}`;
    
    return spawnTmuxSession(sessionName, ['claude', '--permission-mode', 'auto', prompt], workspacePath);
  }
}
