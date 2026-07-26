import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, exec } from 'child_process';
import { checkRepoStatus, initializeOpenSpec, updateChangeProvider, getChangeMetadata, createLocalSchema, createNewChange, resolvePath } from './services/repoService.js';
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

import { getBMADSprints, getBMADArtifacts } from './services/bmadAdapter.js';

app.get('/api/changes', async (req, res) => {
  const repoPath = req.query.path as string;
  if (!repoPath) {
    res.status(400).json({ error: 'Missing path' });
    return;
  }
  try {
    const resolvedPath = resolvePath(repoPath);
    const allChanges: Array<{ id: string; title: string; status: string; framework?: 'openspec' | 'bmad' }> = [];

    // 1. OpenSpec changes
    const changesDir = path.join(resolvedPath, 'openspec', 'changes');
    if (fs.existsSync(changesDir)) {
      const dirs = fs.readdirSync(changesDir, { withFileTypes: true });
      dirs.filter(d => d.isDirectory()).forEach(d => {
        allChanges.push({
          id: d.name,
          title: d.name,
          status: 'In Progress',
          framework: 'openspec'
        });
      });
    }

    // 2. BMAD Sprints
    const bmadSprints = getBMADSprints(resolvedPath);
    bmadSprints.forEach(s => {
      allChanges.push({
        id: s.id,
        title: s.title,
        status: s.status,
        framework: 'bmad'
      });
    });

    res.json(allChanges);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/changes', async (req, res) => {
  const { repoPath, changeName, schemaName, description, proposeEngine } = req.body;
  if (!repoPath || !changeName) {
    res.status(400).json({ error: 'Missing repoPath or changeName' });
    return;
  }
  try {
    await createNewChange(repoPath, changeName, schemaName, description, proposeEngine);
    res.json({ success: true, changeName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schema', async (req, res) => {
  const { repoPath, schemaName, artifacts } = req.body;
  if (!repoPath || !schemaName || !artifacts || !Array.isArray(artifacts)) {
    res.status(400).json({ error: 'Missing repoPath, schemaName, or artifacts array' });
    return;
  }
  try {
    await createLocalSchema(repoPath, schemaName, artifacts);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// V1 Deterministic Endpoints

// Endpoint: Fetch Artifacts
app.get('/api/artifacts', async (req, res) => {
  const repoPath = req.query.path as string;
  const changeName = req.query.change as string;
  const frameworkReq = req.query.framework as string | undefined;
  
  if (!repoPath || !changeName) {
    res.status(400).json({ error: 'Missing path or change' });
    return;
  }

  try {
    const resolvedPath = resolvePath(repoPath);

    // If explicit framework=bmad or if requested change is a BMAD sprint
    const bmadSprints = getBMADSprints(resolvedPath);
    const isBmadSprint = frameworkReq === 'bmad' || bmadSprints.some(s => s.id === changeName);

    if (isBmadSprint) {
      const bmadResult = getBMADArtifacts(resolvedPath, changeName);
      res.json(bmadResult);
      return;
    }

    // Default to OpenSpec change parsing
    const changeDir = path.join(resolvedPath, 'openspec', 'changes', changeName);
    if (!fs.existsSync(changeDir)) {
      res.status(404).json({ error: 'Change not found' });
      return;
    }

    const artifacts: Record<string, any> = { proposal: '', spec: '', design: '', tasks: '', framework: 'openspec' };
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

    let agentProvider = 'antigravity';
    try {
      const metadata = await getChangeMetadata(repoPath, changeName);
      agentProvider = metadata.agentProvider;
    } catch (e) {
      console.error('Failed to get change metadata', e);
    }

    res.json({ artifacts, parsedTasks, files, linkages, agentProvider });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Execute CLI command
app.post('/api/execute', openspecController.executeCommand.bind(openspecController));

// Endpoint: Open Terminal natively (Mac only with iTerm + Terminal.app fallback)
app.post('/api/open-terminal', (req, res) => {
  const { command } = req.body;
  if (!command) {
    res.status(400).json({ error: 'Missing command' });
    return;
  }
  
  const escapedCmd = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `osascript -e '
    try
      tell application "iTerm"
        activate
        if (count of windows) = 0 then
          create window with default profile
        else
          tell current window to create tab with default profile
        end if
        tell current session of current window to write text "${escapedCmd}"
      end tell
    on error
      tell application "Terminal"
        activate
        do script "${escapedCmd}"
      end tell
    end try
  '`;
  
  exec(script, (err) => {
    if (err) {
      console.error('Failed to open native terminal:', err.message);
      res.status(500).json({ error: err.message });
    } else {
      res.json({ success: true });
    }
  });
});

// Endpoint: Native folder chooser dialog defaulting to home directory or provided path
app.post('/api/browse-directory', (req, res) => {
  const rawPath = req.body?.defaultPath || '';
  const resolved = rawPath ? resolvePath(rawPath) : os.homedir();
  const targetDir = (resolved && fs.existsSync(resolved)) ? resolved : os.homedir();
  
  const escapedTarget = targetDir.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const script = `osascript -e 'try' -e 'set startFolder to POSIX file "${escapedTarget}"' -e 'set chosenFolder to choose folder default location startFolder' -e 'POSIX path of chosenFolder' -e 'on error' -e 'try' -e 'set chosenFolder to choose folder' -e 'POSIX path of chosenFolder' -e 'on error' -e 'return "CANCELLED"' -e 'end try' -e 'end try'`;

  exec(script, (err, stdout) => {
    if (err) {
      console.error('Directory browse dialog cancelled or failed:', err.message);
      res.json({ cancelled: true });
      return;
    }
    const result = stdout ? stdout.trim() : '';
    if (!result || result === 'CANCELLED') {
      res.json({ cancelled: true });
    } else {
      const cleanPath = result.endsWith('/') && result.length > 1 ? result.slice(0, -1) : result;
      res.json({ success: true, path: cleanPath });
    }
  });
});

// Endpoint: Send a raw text message to an existing agent tmux session
app.post('/api/send-message', (req, res) => {
  const { changeName, sessionName: reqSession, message } = req.body;
  const sessionName = reqSession || (changeName ? `agent-${changeName}` : '');

  if (!sessionName || !message) {
    res.status(400).json({ error: 'Missing sessionName/changeName or message' });
    return;
  }

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
        res.status(500).json({ error: `Failed to send message to tmux session '${sessionName}'` });
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/changes/:change/provider', async (req, res) => {
  const changeName = req.params.change;
  const repoPath = req.body.path as string;
  const agentProvider = req.body.provider as string;

  if (!repoPath || !agentProvider) {
    res.status(400).json({ error: 'Missing path or provider parameter' });
    return;
  }

  try {
    await updateChangeProvider(repoPath, changeName, agentProvider);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { app };
