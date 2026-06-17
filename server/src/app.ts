import express from 'express';
import cors from 'cors';
import { checkRepoStatus, initializeOpenSpec, createGitWorktree } from './services/repoService.js';
import { getChanges, getChangeDag } from './services/dagService.js';

const app = express();

app.use(cors());
app.use(express.json());

// API route to get repository status
app.get('/api/status', async (req, res) => {
  const repoPath = req.query.path;

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter "path"' });
  }

  try {
    const status = await checkRepoStatus(repoPath);
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// API route to initialize OpenSpec
app.post('/api/init', async (req, res) => {
  const { path } = req.body;

  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Missing parameter "path"' });
  }

  try {
    await initializeOpenSpec(path);
    return res.json({ success: true, message: 'OpenSpec initialized successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to initialize OpenSpec' });
  }
});

// API route to create a git worktree
app.post('/api/worktree', async (req, res) => {
  const { repoPath, branchName, worktreePath } = req.body;

  if (!repoPath || !branchName || !worktreePath) {
    return res.status(400).json({
      error: 'Missing parameters: repoPath, branchName, and worktreePath are all required',
    });
  }

  try {
    await createGitWorktree(repoPath, branchName, worktreePath);
    return res.json({ success: true, message: 'Git worktree created successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create Git worktree' });
  }
});

// API route to list changes
app.get('/api/changes', async (req, res) => {
  const repoPath = req.query.path;

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter "path"' });
  }

  try {
    const changes = await getChanges(repoPath);
    return res.json(changes);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retrieve changes list' });
  }
});

// API route to get change DAG
app.get('/api/changes/:change/dag', async (req, res) => {
  const repoPath = req.query.path;
  const changeName = decodeURIComponent(req.params.change);

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter "path"' });
  }

  try {
    const dag = await getChangeDag(repoPath, changeName);
    return res.json(dag);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to build DAG' });
  }
});

export { app };


