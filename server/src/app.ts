import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { checkRepoStatus, initializeOpenSpec } from './services/repoService.js';
import { OpenSpecController } from './controllers/openspecController.js';
import { parseTasks } from './services/markdownParser.js';

const app = express();
const openspecController = new OpenSpecController();

app.use(cors());
app.use(express.json());

// Legacy endpoints retained for workspace initialization
app.get('/api/status', async (req, res) => {
  const repoPath = req.query.path as string;
  if (!repoPath) {
    res.status(400).json({ error: 'Missing query parameter "path"' });
    return;
  }
  try {
    const status = await checkRepoStatus(repoPath);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/init', async (req, res) => {
  const { path: repoPath } = req.body;
  if (!repoPath) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }
  try {
    await initializeOpenSpec(repoPath);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/changes', async (req, res) => {
  const repoPath = req.query.path as string;
  if (!repoPath) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }
  try {
    const changesDir = path.join(repoPath, 'openspec', 'changes');
    if (!fs.existsSync(changesDir)) {
      res.json([]);
      return;
    }
    const dirs = fs.readdirSync(changesDir, { withFileTypes: true });
    const changes = dirs.filter(d => d.isDirectory()).map(d => ({
      id: d.name,
      title: d.name,
      status: 'In Progress'
    }));
    res.json(changes);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// V1 Deterministic Endpoints

// Endpoint: Fetch Artifacts
app.get('/api/artifacts', async (req, res) => {
  const repoPath = req.query.path as string;
  const changeName = req.query.change as string;
  
  if (!repoPath || !changeName) {
    res.status(400).json({ error: 'Missing path or change' });
    return;
  }

  try {
    const changeDir = path.join(repoPath, 'openspec', 'changes', changeName);
    if (!fs.existsSync(changeDir)) {
      res.status(404).json({ error: 'Change not found' });
      return;
    }

    const artifacts: Record<string, string> = { proposal: '', spec: '', design: '', tasks: '' };
    let files: string[] = [];
    let parsedTasks: any[] = [];
    let linkages: any[] = [];

    if (fs.existsSync(changeDir)) {
      const allPaths = fs.readdirSync(changeDir, { recursive: true }) as string[];
      files = allPaths.filter(f => {
        try {
          return fs.statSync(path.join(changeDir, f)).isFile();
        } catch (e) {
          return false;
        }
      });

      for (const f of files) {
        const filePath = path.join(changeDir, f);
        if (f === 'proposal.md') {
          artifacts['proposal'] = fs.readFileSync(filePath, 'utf-8');
        } else if (f === 'design.md') {
          artifacts['design'] = fs.readFileSync(filePath, 'utf-8');
        } else if (f === 'tasks.md') {
          artifacts['tasks'] = fs.readFileSync(filePath, 'utf-8');
        } else if (f.endsWith('spec.md')) {
          const content = fs.readFileSync(filePath, 'utf-8');
          artifacts['spec'] = artifacts['spec'] ? artifacts['spec'] + '\n\n---\n\n' + content : content;
        } else if (f === 'linkages.json') {
          try {
            linkages = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          } catch (e) {
            console.error('Failed to parse linkages.json', e);
          }
        }
      }

      // Deterministically parse Tasks
      if (artifacts['tasks']) {
        parsedTasks = parseTasks(artifacts['tasks']);
      }
    }

    res.json({ artifacts, parsedTasks, files, linkages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Execute CLI command
app.post('/api/execute', openspecController.executeCommand.bind(openspecController));

// Endpoint: Open Terminal natively (Mac only)
app.post('/api/open-terminal', (req, res) => {
  const { command } = req.body;
  if (!command) {
    res.status(400).json({ error: 'Missing command' });
    return;
  }
  
  const script = `osascript -e 'tell application "iTerm"
    activate
    if (count of windows) = 0 then
      create window with default profile
    else
      tell current window to create tab with default profile
    end if
    tell current session of current window to write text "${command.replace(/"/g, '\\"')}"
  end tell'`;
  
  const child = spawn(script, { shell: true });
  child.on('close', () => {
    res.json({ success: true });
  });
  child.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
});

// Endpoint: Send a raw text message to an existing agent tmux session
app.post('/api/send-message', (req, res) => {
  const { changeName, message } = req.body;
  if (!changeName || !message) {
    res.status(400).json({ error: 'Missing changeName or message' });
    return;
  }

  const sessionName = `agent-${changeName}`;
  try {
    // Escape double quotes and backslashes for bash
    const escapedMessage = message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    
    // We send the message surrounded by quotes, and follow it with C-m (Enter)
    const cmd = `tmux send-keys -t ${sessionName} "${escapedMessage}" C-m`;
    const child = spawn(cmd, { shell: true });
    
    child.on('close', (code) => {
      if (code === 0) {
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Failed to send message to tmux session' });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { app };
