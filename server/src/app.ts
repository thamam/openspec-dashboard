import express from 'express';
import cors from 'cors';
import { checkRepoStatus, initializeOpenSpec, createGitWorktree, createLocalSchema, createNewChange, getChangeMetadata, updateProposeEngine } from './services/repoService.js';
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

// API route to create local schema
app.post('/api/schema', async (req, res) => {
  const { repoPath, schemaName, artifacts } = req.body;

  if (!repoPath || !schemaName || !artifacts || !Array.isArray(artifacts)) {
    return res.status(400).json({
      error: 'Missing parameters: repoPath, schemaName, and artifacts (array) are all required',
    });
  }

  try {
    await createLocalSchema(repoPath, schemaName, artifacts);
    return res.json({ success: true, message: 'Local schema initialized successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to initialize local schema' });
  }
});

// API route to create new change
app.post('/api/changes', async (req, res) => {
  const { repoPath, changeName, schemaName, description, proposeEngine } = req.body;

  if (!repoPath || !changeName) {
    return res.status(400).json({
      error: 'Missing parameters: repoPath and changeName are required',
    });
  }

  try {
    await createNewChange(repoPath, changeName, schemaName, description, proposeEngine);
    return res.json({ success: true, message: 'Change proposal created successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create change proposal' });
  }
});

// API route to get change metadata
app.get('/api/changes/:change', async (req, res) => {
  const repoPath = req.query.path;
  const changeName = decodeURIComponent(req.params.change);

  if (!repoPath || typeof repoPath !== 'string') {
    return res.status(400).json({ error: 'Missing query parameter "path"' });
  }

  try {
    const metadata = await getChangeMetadata(repoPath, changeName);
    return res.json(metadata);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to retrieve change metadata' });
  }
});

// API route to update propose engine
app.post('/api/changes/:change/engine', async (req, res) => {
  const { repoPath, proposeEngine } = req.body;
  const changeName = decodeURIComponent(req.params.change);

  if (!repoPath || !proposeEngine) {
    return res.status(400).json({
      error: 'Missing parameters: repoPath and proposeEngine are required',
    });
  }

  try {
    await updateProposeEngine(repoPath, changeName, proposeEngine);
    return res.json({ success: true, message: 'Propose engine updated successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update propose engine' });
  }
});

export { app };


