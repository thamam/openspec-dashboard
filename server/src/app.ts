import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, exec } from 'child_process';
import { checkRepoStatus, initializeOpenSpec, updateChangeProvider, getChangeMetadata, createLocalSchema, createNewChange, resolvePath } from './services/repoService.js';
import { OpenSpecController } from './controllers/openspecController.js';
import { parseTasks } from './services/markdownParser.js';
import { getKeystoneManifest } from './services/keystoneService.js';
import { corsOptions } from './cors.js';

const app = express();
const openspecController = new OpenSpecController();

app.use(cors(corsOptions));
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
    const resolvedPath = resolvePath(repoPath);
    const changesDir = path.join(resolvedPath, 'openspec', 'changes');
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
  
  if (!repoPath || !changeName) {
    res.status(400).json({ error: 'Missing path or change' });
    return;
  }

  try {
    const resolvedPath = resolvePath(repoPath);
    const changeDir = path.join(resolvedPath, 'openspec', 'changes', changeName);
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

// Endpoint: Keystone handshake v0.1 manifest (.aidev/manifest.yaml) with fresh/stale per artifact
app.get('/api/keystone/manifest', async (req, res) => {
  const repoPath = (req.query.path || req.query.repo) as string;
  if (!repoPath) {
    res.status(400).json({ error: 'Missing query parameter "path"' });
    return;
  }
  try {
    const result = await getKeystoneManifest(repoPath);
    res.json(result);
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
const SESSION_NAME_RE = /^[a-zA-Z0-9_.-]+$/;

app.post('/api/send-message', (req, res) => {
  const { changeName, sessionName: reqSession, message } = req.body;
  const sessionName = reqSession || (changeName ? `agent-${changeName}` : '');

  if (!sessionName || !message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing sessionName/changeName or message' });
    return;
  }

  if (typeof sessionName !== 'string' || !SESSION_NAME_RE.test(sessionName)) {
    res.status(400).json({ error: 'Invalid sessionName' });
    return;
  }

  // No shell: message is a single literal argv element, so no escaping is needed
  // and shell metacharacters in it cannot execute.
  const child = spawn('tmux', ['send-keys', '-t', sessionName, message, 'C-m']);

  let responded = false;
  child.on('error', (err) => {
    if (responded) return;
    responded = true;
    res.status(500).json({ error: `Failed to spawn tmux: ${err.message}` });
  });
  child.on('close', (code) => {
    if (responded) return;
    responded = true;
    if (code === 0) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: `Failed to send message to tmux session '${sessionName}'` });
    }
  });
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
