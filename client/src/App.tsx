import React, { useState, useEffect } from 'react';
import './App.css';

interface RepoStatus {
  exists: boolean;
  isGit: boolean;
  isOpenSpec: boolean;
}

function App() {
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // OpenSpec Init states
  const [initLoading, setInitLoading] = useState(false);

  // Git Worktree states
  const [branchName, setBranchName] = useState('');
  const [worktreePath, setWorktreePath] = useState('');
  const [worktreeLoading, setWorktreeLoading] = useState(false);
  const [worktreeSuccess, setWorktreeSuccess] = useState<string | null>(null);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);

  // Auto-generate default worktree path based on current path and branch name
  useEffect(() => {
    if (path) {
      const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
      if (lastSlash !== -1) {
        const parentDir = path.substring(0, lastSlash);
        const repoName = path.substring(lastSlash + 1);
        const cleanBranch = branchName.replace(/[^a-zA-Z0-9._/-]/g, '').replace(/\//g, '-');
        setWorktreePath(`${parentDir}/${repoName}-worktrees/${cleanBranch || 'new-branch'}`);
      }
    }
  }, [path, branchName]);

  const refetchStatus = async () => {
    try {
      const res = await fetch(`/api/status?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data: RepoStatus = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error('Failed to refetch status', err);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) {
      setError('Please enter a directory path');
      setStatus(null);
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    setWorktreeSuccess(null);
    setWorktreeError(null);

    try {
      const res = await fetch(`/api/status?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const data: RepoStatus = await res.json();
      setStatus(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInitOpenSpec = async () => {
    setInitLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize OpenSpec');
      }
      // Refetch directory status
      await refetchStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to initialize OpenSpec');
    } finally {
      setInitLoading(false);
    }
  };

  const handleCreateWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorktreeSuccess(null);
    setWorktreeError(null);

    if (!branchName.trim() || !worktreePath.trim()) {
      setWorktreeError('Branch Name and Worktree Path are required');
      return;
    }

    setWorktreeLoading(true);

    try {
      const res = await fetch('/api/worktree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: path,
          branchName,
          worktreePath,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create git worktree');
      }
      setWorktreeSuccess(data.message || 'Git worktree created successfully');
      setBranchName('');
    } catch (err: any) {
      setWorktreeError(err.message || 'Failed to create git worktree');
    } finally {
      setWorktreeLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>OpenSpec Dashboard</h1>
        <p className="app-subtitle">A Premium Development Interface for the Anti-Gravity Protocol</p>
      </header>

      <main className="app-content">
        <section className="verify-section">
          <h2>Verify Local Project Directory</h2>
          <form onSubmit={handleVerify} className="verify-form">
            <div className="input-group">
              <input
                id="repo-path-input"
                type="text"
                placeholder="Enter local repository absolute path..."
                value={path}
                onChange={(e) => setPath(e.target.value)}
                disabled={loading}
              />
            </div>
            <button id="verify-btn" type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify Path'}
            </button>
          </form>
        </section>

        {error && (
          <section className="status-section error-card">
            <h3>Verification Failed</h3>
            <p className="error-message">Error: {error}</p>
          </section>
        )}

        {status && (
          <>
            <section className="status-section">
              {status.exists ? (
                <div className="status-grid">
                  <div className="status-card-header">
                    <h3>Project Folder Verified</h3>
                    <span className="badge badge-success">Active</span>
                  </div>
                  
                  <div className="status-item">
                    <div className="status-label">Directory Path:</div>
                    <div className="status-value path-value">{path}</div>
                  </div>

                  <div className="status-item">
                    <div className="status-label">Git Integration:</div>
                    <div className={`status-indicator ${status.isGit ? 'text-success' : 'text-danger'}`}>
                      <span className="dot"></span>
                      {status.isGit ? 'Git: Initialized' : 'Git: Not Initialized'}
                    </div>
                  </div>

                  <div className="status-item">
                    <div className="status-label">OpenSpec Engine:</div>
                    <div className={`status-indicator ${status.isOpenSpec ? 'text-success' : 'text-danger'}`}>
                      <span className="dot"></span>
                      {status.isOpenSpec ? 'OpenSpec: Initialized' : 'OpenSpec: Not Initialized'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="status-grid error-card">
                  <div className="status-card-header">
                    <h3>Directory does not exist</h3>
                    <span className="badge badge-danger">Not Found</span>
                  </div>
                  <p className="error-message">
                    The directory <code>{path}</code> was not found on the local filesystem.
                  </p>
                </div>
              )}
            </section>

            {status.exists && status.isGit && !status.isOpenSpec && (
              <section className="action-section init-card">
                <div className="action-header">
                  <h3>Initialize OpenSpec</h3>
                  <p>Enable OpenSpec change tracking and specs pipelines for this project.</p>
                </div>
                <button
                  id="init-openspec-btn"
                  onClick={handleInitOpenSpec}
                  disabled={initLoading}
                  className="btn btn-primary"
                >
                  {initLoading ? 'Initializing...' : 'Initialize OpenSpec'}
                </button>
              </section>
            )}

            {status.exists && status.isGit && status.isOpenSpec && (
              <section className="action-section worktree-section">
                <div className="action-header">
                  <h3>Git Worktree Management</h3>
                  <p>Checkout a new development branch to an isolated local folder.</p>
                </div>

                <form onSubmit={handleCreateWorktree} className="worktree-form">
                  <div className="form-group">
                    <label htmlFor="branch-name-input">Branch Name:</label>
                    <input
                      id="branch-name-input"
                      type="text"
                      placeholder="e.g., feature/new-logic"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      disabled={worktreeLoading}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="worktree-path-input">Worktree Destination Path:</label>
                    <input
                      id="worktree-path-input"
                      type="text"
                      placeholder="Enter absolute destination path..."
                      value={worktreePath}
                      onChange={(e) => setWorktreePath(e.target.value)}
                      disabled={worktreeLoading}
                      required
                    />
                  </div>

                  <button
                    id="create-worktree-btn"
                    type="submit"
                    disabled={worktreeLoading || !branchName.trim() || !worktreePath.trim()}
                    className="btn btn-primary"
                  >
                    {worktreeLoading ? 'Creating Worktree...' : 'Create Worktree'}
                  </button>
                </form>

                {worktreeSuccess && (
                  <div className="message message-success">
                    <p>{worktreeSuccess}</p>
                  </div>
                )}

                {worktreeError && (
                  <div className="message message-danger">
                    <p>Error: {worktreeError}</p>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
