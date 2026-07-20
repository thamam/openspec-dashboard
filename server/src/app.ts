import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { checkRepoStatus, initializeOpenSpec, createGitWorktree, createLocalSchema, createNewChange, getChangeMetadata } from './services/repoService.js';
import { OpenSpecController } from './controllers/openspecController.js';
import { parseTasks } from './services/markdownParser.js';

const app = express();
const openspecController = new OpenSpecController();

app.use(cors());
app.use(express.json());

// Legacy endpoints retained for workspace initialization
app.get('/api/status', async (req, res) => {
  const repoPath = req.query.path as string;
  if (!repoPath) return res.status(400).json({ error: 'Missing query parameter "path"' });
  try {
    return res.json(await checkRepoStatus(repoPath));
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/init', async (req, res) => {
  const { path: repoPath } = req.body;
  if (!repoPath) return res.status(400).json({ error: 'Missing path' });
  try {
    await initializeOpenSpec(repoPath);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/changes', async (req, res) => {
  const repoPath = req.query.path as string;
  if (!repoPath) return res.status(400).json({ error: 'Missing path' });
  try {
    const changesDir = path.join(repoPath, 'openspec', 'changes');
    if (!fs.existsSync(changesDir)) return res.json([]);
    const dirs = fs.readdirSync(changesDir, { withFileTypes: true });
    const changes = dirs.filter(d => d.isDirectory()).map(d => ({
      id: d.name,
      title: d.name,
      status: 'In Progress'
    }));
    return res.json(changes);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// V1 Deterministic Endpoints

// Endpoint: Fetch Artifacts
app.get('/api/artifacts', async (req, res) => {
  const repoPath = req.query.path as string;
  const changeName = req.query.change as string;
  
  if (!repoPath || !changeName) return res.status(400).json({ error: 'Missing path or change' });

  try {
    const changeDir = path.join(repoPath, 'openspec', 'changes', changeName);
    if (!fs.existsSync(changeDir)) return res.status(404).json({ error: 'Change not found' });

    const artifacts: Record<string, string> = {};
    const filesToRead = ['proposal.md', 'spec.md', 'design.md', 'tasks.md'];
    
    for (const file of filesToRead) {
      const filePath = path.join(changeDir, file);
      artifacts[file.replace('.md', '')] = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    }

    // Deterministically parse Tasks
    let parsedTasks: any[] = [];
    if (artifacts['tasks']) {
      parsedTasks = parseTasks(artifacts['tasks']);
    }

    return res.json({ artifacts, parsedTasks });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Endpoint: Execute CLI command
app.post('/api/execute', async (req, res) => {
  const { repoPath, command, args } = req.body;
  if (!repoPath || !command) return res.status(400).json({ error: 'Missing repoPath or command' });

  // Stream execution headers
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Transfer-Encoding', 'chunked');

  try {
    const stream = await openspecController.executeCommand(command, args || [], repoPath);
    
    stream.onData((data) => res.write(data));
    stream.onError((data) => res.write(`ERROR: ${data}`));
    stream.onExit((code) => {
      res.write(`\nPROCESS EXITED WITH CODE ${code}\n`);
      res.end();
    });
  } catch (err: any) {
    res.write(`ERROR FAILED TO SPAWN: ${err.message}\n`);
    res.end();
  }
});

export { app };
