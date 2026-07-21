import { Server } from 'socket.io';
import chokidar from 'chokidar';
import path from 'path';
import fs from 'fs';
import { LocalAgentWrapper } from './LocalAgentWrapper.js';

export class AgentService {
  private io: Server;
  private watcher: chokidar.FSWatcher | null = null;
  private activeRepoPath: string = '';
  private agentWrapper: LocalAgentWrapper;
  // Prevent duplicate runs for the same file in quick succession
  private activeAnalyses: Set<string> = new Set();
  private chatHistory: any[] = [];

  constructor(io: Server) {
    this.io = io;
    this.agentWrapper = new LocalAgentWrapper();
  }

  public start() {
    this.io.on('connection', (socket) => {
      console.log('Client connected to AgentService websocket');
      
      socket.on('set_repo_path', (repoPath: string) => {
        if (this.activeRepoPath !== repoPath) {
          this.activeRepoPath = repoPath;
          this.chatHistory = this.loadChatHistory();
          this.restartWatcher();
        }
        socket.emit('chat_history', this.chatHistory);
      });

      socket.on('chat_message', async (data) => {
        const { message, context } = data;
        console.log(`[AgentService] Received chat message: ${message}`);
        
        this.chatHistory.push({ role: 'user', content: message });
        this.saveChatHistory(this.chatHistory);

        let agentReply = '';
        await this.agentWrapper.chat(this.activeRepoPath, message, context, (chunk) => {
          agentReply += chunk;
          socket.emit('chat_reply_chunk', chunk);
        });
        
        this.chatHistory.push({ role: 'agent', content: agentReply });
        this.saveChatHistory(this.chatHistory);
        
        socket.emit('chat_reply_complete');
      });

      socket.on('trigger_autofix', async (data) => {
        const { file, message } = data;
        console.log(`[AgentService] Triggering autofix for ${file}`);
        await this.agentWrapper.autofix(file, message);
        socket.emit('autofix_complete');
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

    this.watcher.on('all', (event, filePath) => {
      // Only care about markdown or json files
      if (!filePath.endsWith('.md') && !filePath.endsWith('.json')) return;
      
      // Debounce logic or ignore unlinking
      if (event === 'unlink' || this.activeAnalyses.has(filePath)) return;
      
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
