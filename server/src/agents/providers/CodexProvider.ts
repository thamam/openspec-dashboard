import { IAgentProvider, ExecutionStream } from '../AgentProvider.js';
import { spawnTmuxSession } from '../tmuxSession.js';

export class CodexProvider implements IAgentProvider {

  public async executeLifecycle(command: string, args: string[], workspacePath: string): Promise<ExecutionStream> {
    const changeName = (args[0] || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
    const sessionName = `agent-${changeName}`;

    let instruction = '';
    if (command === 'opsx-continue') {
      instruction = `Please follow the workflow instructions in .agent/workflows/opsx-continue.md to continue change ${changeName}`;
    } else {
      instruction = `Please run the OpenSpec command /${command} ${args.join(' ')}`;
    }

    // Non-interactive (no approval prompts), scoped to workspace writes — the Codex analog of Claude's --permission-mode auto.
    // argv form (no shell): the instruction is one literal positional element,
    // always 'Please ...'-prefixed so it can never lead with '-'.
    return spawnTmuxSession(
      sessionName,
      ['codex', '--ask-for-approval', 'never', '--sandbox', 'workspace-write', instruction],
      workspacePath
    );
  }

  public async executeTask(taskContext: string, workspacePath: string): Promise<ExecutionStream> {
    const sessionName = `agent-task-${Date.now()}`;
    const prompt = `Please complete the following task from the OpenSpec tasks.md:\n\n${taskContext}`;

    return spawnTmuxSession(
      sessionName,
      ['codex', '--ask-for-approval', 'never', '--sandbox', 'workspace-write', prompt],
      workspacePath
    );
  }
}
