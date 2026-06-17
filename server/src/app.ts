import express from 'express';
import cors from 'cors';
import { checkRepoStatus } from './services/repoService.js';

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

export { app };
