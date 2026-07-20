import { ChildProcess } from 'child_process';

export interface ExecutionStream {
  process: ChildProcess;
  onData: (callback: (data: string) => void) => void;
  onError: (callback: (error: string) => void) => void;
  onExit: (callback: (code: number | null) => void) => void;
}

/**
 * Core interface for AI providers. This ensures the dashboard remains
 * model-agnostic and robust against breaking agent API changes.
 */
export interface IAgentProvider {
  /**
   * Executes an OpenSpec lifecycle command (e.g. opsx-propose).
   */
  executeLifecycle(command: string, args: string[], workspacePath: string): Promise<ExecutionStream>;
  
  /**
   * Executes a specific task from tasks.md.
   * This is triggered when an Agent "claims" a task.
   */
  executeTask(taskContext: string, workspacePath: string): Promise<ExecutionStream>;
}
