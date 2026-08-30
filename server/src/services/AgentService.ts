import { Server } from 'socket.io';
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { LocalAgentWrapper } from './LocalAgentWrapper.js';
import { checkRepoStatus, resolvePath } from './repoService.js';
import { SHELL_METACHAR_PATTERN } from '../utils/paths.js';

export class AgentService {
  private io: Server;
  private watcher: any = null;
  private activeRepoPath: string = '';
  private agentWrapper: LocalAgentWrapper;
  // Prevent duplicate runs for the same file in quick succession
  private activeAnalyses: Set<string> = new Set();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private chatHistory: any[] = [];

  constructor(io: Server) {
    this.io = io;
    this.agentWrapper = new LocalAgentWrapper();
  }

  public start() {
    this.io.on('connection', (socket) => {
      console.log('Client connected to AgentService websocket');
      
      socket.on('set_repo_path', async (repoPath: string) => {
        // Socket trust boundary: this value becomes the containment root for
        // autofix writes and the cwd for agent spawns — validate it the same
        // way the REST surface does (openspecController), or one emit sets the
        // root to /etc and "containment" writes anywhere.
        try {
          if (typeof repoPath !== 'string' || repoPath.length === 0 || SHELL_METACHAR_PATTERN.test(repoPath)) {
            socket.emit('repo_error', { error: 'Invalid repoPath: must be a plain path string without shell metacharacters' });
            return;
          }
          const resolvedRepoPath = resolvePath(repoPath);
          const status = await checkRepoStatus(resolvedRepoPath);
          if (!status?.exists || !status.isGit) {
            socket.emit('repo_error', { error: 'repoPath is not a valid Git repository' });
            return;
          }
          // checkRepoStatus finds .git by walking UPWARD — a submitted
          // subdirectory (or $HOME on a dotfiles-repo machine) would
          // otherwise become the containment root for autofix writes.
          // Anchor to the actual git root.
          const rootPath = status.repoRoot ?? resolvedRepoPath;
          if (this.activeRepoPath !== rootPath) {
            this.activeRepoPath = rootPath;
            this.chatHistory = this.loadChatHistory();
            this.restartWatcher();
          }
          socket.emit('chat_history', this.chatHistory);
        } catch (err: any) {
          console.error(`[AgentService] Error handling set_repo_path:`, err.message);
          socket.emit('repo_error', { error: err.message });
        }
      });

      socket.on('chat_message', async (data) => {
        const { message, context } = data;
        console.log(`[AgentService] Received chat message: ${message}`);
        
        this.chatHistory.push({ role: 'user', content: message });
        this.saveChatHistory(this.chatHistory);

        let agentReply = '';
        try {
          // 45s timeout protection
          const chatPromise = this.agentWrapper.chat(this.activeRepoPath, message, context, (chunk) => {
            agentReply += chunk;
            socket.emit('chat_reply_chunk', chunk);
          });

          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Agent reply timed out after 45 seconds')), 45000)
          );

          await Promise.race([chatPromise, timeoutPromise]);
          
          this.chatHistory.push({ role: 'agent', content: agentReply });
          this.saveChatHistory(this.chatHistory);
          socket.emit('chat_reply_complete');
        } catch (err: any) {
          console.error(`[AgentService] Error handling chat message:`, err.message);
          const errorMsg = `⚠️ Unable to complete request: ${err.message || 'Agent service error'}`;
          socket.emit('chat_reply_chunk', errorMsg);
          this.chatHistory.push({ role: 'agent', content: errorMsg });
          this.saveChatHistory(this.chatHistory);
          socket.emit('chat_reply_error', { error: err.message });
        }
      });

      socket.on('trigger_autofix', async (data) => {
        const { file, message } = data;
        console.log(`[AgentService] Triggering autofix for ${file}`);
        try {
          const autofixPromise = this.agentWrapper.autofix(this.activeRepoPath, file, message);
          const timeoutPromise = new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Autofix timed out after 45 seconds')), 45000)
          );

          await Promise.race([autofixPromise, timeoutPromise]);
          socket.emit('autofix_complete');
        } catch (err: any) {
          console.error(`[AgentService] Error handling autofix:`, err.message);
          socket.emit('autofix_error', { error: err.message });
        }
      });

      socket.on('execute_workflow', async (data) => {
        const { workflow, changeName, args = [] } = data;
        console.log(`[AgentService] Executing workflow /${workflow} for change: ${changeName}`);
        try {
          socket.emit('workflow_start', { workflow, changeName });
          await this.agentWrapper.executeWorkflow(
            this.activeRepoPath,
            workflow,
            changeName || 'default',
            args,
            (chunk) => {
              socket.emit('workflow_chunk', { chunk });
            }
          );
          socket.emit('workflow_complete', { workflow, changeName });
        } catch (err: any) {
          console.error(`[AgentService] Error executing workflow /${workflow}:`, err.message);
          socket.emit('workflow_error', { workflow, error: err.message });
        }
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected from AgentService');
      });
    });
  }

  private restartWatcher() {
    if (this.watcher) {
      this.watcher.close();
    }
    
    if (!this.activeRepoPath) return;

    const changesDir = path.join(this.activeRepoPath, 'openspec', 'changes');
    console.log(`[AgentService] Watching for changes in ${changesDir}`);
    
    this.watcher = chokidar.watch(changesDir, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('all', (event: string, filePath: string) => {
      // Only care about markdown or json files
      if (!filePath.endsWith('.md') && !filePath.endsWith('.json')) return;
      
      if (event === 'unlink' || this.activeAnalyses.has(filePath)) return;

      if (this.debounceTimers.has(filePath)) {
        clearTimeout(this.debounceTimers.get(filePath));
      }
      
      const timer = setTimeout(() => {
        this.debounceTimers.delete(filePath);
        console.log(`[AgentService] Detected ${event} on ${filePath}`);
        this.io.emit('agent_event', {
          type: 'file_change',
          action: event,
          file: filePath,
          fileName: path.basename(filePath),
          timestamp: new Date().toISOString()
        });

        // Launch real-time analysis!
        this.activeAnalyses.add(filePath);
        
        this.agentWrapper.analyzeFile(this.activeRepoPath, filePath, (chunk) => {
          this.io.emit('agent_event', {
            type: 'analysis_chunk',
            chunk: chunk,
            timestamp: new Date().toISOString()
          });
        }).then(result => {
          this.activeAnalyses.delete(filePath);
          if (result) {
            this.io.emit('agent_event', {
              type: 'analysis_complete',
              result: result,
              timestamp: new Date().toISOString()
            });
          }
        });
      }, 300);

      this.debounceTimers.set(filePath, timer);
    });
  }

  private loadChatHistory(): any[] {
    if (!this.activeRepoPath) return [];
    const p = path.join(this.activeRepoPath, '.agent', 'chat_history.json');
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      }
    } catch (e) {
       console.error("Failed to load chat history", e);
    }
    return [];
  }

  private saveChatHistory(history: any[]) {
    if (!this.activeRepoPath) return;
    const dir = path.join(this.activeRepoPath, '.agent');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, 'chat_history.json');
    fs.writeFileSync(p, JSON.stringify(history, null, 2));
  }
}
