import React, { useState, useEffect } from 'react';
import './App.css';
import DagViewer from './components/DagViewer.js';
import CreateChangeForm from './components/CreateChangeForm.js';

interface RepoStatus {
  exists: boolean;
  isGit: boolean;
  isOpenSpec: boolean;
}

interface DagNode {
  id: string;
  label: string;
  type: 'proposal' | 'spec-requirement' | 'spec-scenario' | 'design-decision' | 'task';
  status?: 'pending' | 'completed';
}

interface DagEdge {
  source: string;
  target: string;
}

interface DagData {
  nodes: DagNode[];
  edges: DagEdge[];
}

interface ChangeMetadata {
  name: string;
  schema: string;
  created: string;
  description: string;
  proposeEngine: string;
}

function App() {
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'workspace' | 'review'>('workspace');

  // OpenSpec Init states
  const [initLoading, setInitLoading] = useState(false);

  // OpenSpec Change states
  const [showCreateChange, setShowCreateChange] = useState(false);
  const [createChangeSuccess, setCreateChangeSuccess] = useState<string | null>(null);

  // Git Worktree states
  const [branchName, setBranchName] = useState('');
  const [worktreePath, setWorktreePath] = useState('');
  const [worktreeLoading, setWorktreeLoading] = useState(false);
  const [worktreeSuccess, setWorktreeSuccess] = useState<string | null>(null);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);

  // Review Mode states
  const [changesList, setChangesList] = useState<string[]>([]);
  const [selectedChange, setSelectedChange] = useState<string>('');
  const [dagData, setDagData] = useState<DagData | null>(null);
  const [dagLoading, setDagLoading] = useState(false);
  const [dagError, setDagError] = useState<string | null>(null);

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

  // Load changes list when switching to Review Tab or when path is verified
  useEffect(() => {
    if (activeTab === 'review' && status?.exists && status?.isGit) {
      fetchChanges();
    }
  }, [activeTab, path, status]);

  const [selectedChangeMetadata, setSelectedChangeMetadata] = useState<ChangeMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const fetchMetadata = async (changeName: string) => {
    setMetadataLoading(true);
    setMetadataError(null);
    try {
      const res = await fetch(`/api/changes/${encodeURIComponent(changeName)}?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load change metadata');
      }
      setSelectedChangeMetadata(data);
    } catch (err: any) {
      setMetadataError(err.message || 'Failed to load change metadata');
      setSelectedChangeMetadata(null);
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleUpdateEngine = async (newEngine: string) => {
    if (!selectedChange || !path) return;
    try {
      const res = await fetch(`/api/changes/${encodeURIComponent(selectedChange)}/engine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: path,
          proposeEngine: newEngine,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update propose engine');
      }
      // Update local state
      setSelectedChangeMetadata(prev => prev ? { ...prev, proposeEngine: newEngine } : null);
    } catch (err: any) {
      console.error('Failed to update propose engine', err);
      alert(err.message || 'Failed to update propose engine');
    }
  };

  // Load DAG and metadata when selected change changes
  useEffect(() => {
    if (selectedChange && path) {
      fetchDag();
      fetchMetadata(selectedChange);
    } else {
      setDagData(null);
      setSelectedChangeMetadata(null);
    }
  }, [selectedChange, path]);

  const fetchChanges = async () => {
    try {
      const res = await fetch(`/api/changes?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const data = await res.json();
        setChangesList(data);
        if (data.length > 0 && !selectedChange) {
          setSelectedChange(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load changes', err);
    }
  };

  const fetchDag = async () => {
    setDagLoading(true);
    setDagError(null);
    try {
      const res = await fetch(`/api/changes/${encodeURIComponent(selectedChange)}/dag?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load DAG');
      }
      setDagData(data);
    } catch (err: any) {
      setDagError(err.message || 'Failed to load DAG');
      setDagData(null);
    } finally {
      setDagLoading(false);
    }
  };

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
    setDagData(null);
    setSelectedChange('');
    setChangesList([]);
    setShowCreateChange(false);
    setCreateChangeSuccess(null);

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

      {status?.exists && status?.isGit && (
        <div className="app-tabs">
          <button
            className={`tab-btn ${activeTab === 'workspace' ? 'active' : ''}`}
            onClick={() => setActiveTab('workspace')}
          >
            📂 Workspace
          </button>
          <button
            className={`tab-btn ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => setActiveTab('review')}
            id="review-mode-tab"
          >
            📊 Review Mode
          </button>
        </div>
      )}

      <main className="app-content">
        {activeTab === 'workspace' ? (
          <>
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
                  <>
                    <section className="action-section change-section">
                      <div className="action-header">
                        <h3>Change Management</h3>
                        <p>Create and plan new changes using standard workflows or custom states.</p>
                      </div>

                      {!showCreateChange ? (
                        <button
                          id="show-create-change-btn"
                          onClick={() => {
                            setShowCreateChange(true);
                            setCreateChangeSuccess(null);
                          }}
                          className="btn btn-primary"
                        >
                          Create New Change
                        </button>
                      ) : (
                        <CreateChangeForm
                          repoPath={path}
                          onCreateSuccess={(changeName) => {
                            setShowCreateChange(false);
                            setCreateChangeSuccess(`Change "${changeName}" created successfully.`);
                            fetchChanges();
                            setSelectedChange(changeName);
                          }}
                          onCancel={() => setShowCreateChange(false)}
                        />
                      )}

                      {createChangeSuccess && (
                        <div className="message message-success" id="change-create-success">
                          <p>{createChangeSuccess}</p>
                        </div>
                      )}
                    </section>

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
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <section className="review-section-wrapper">
            <div className="review-header-card">
              <h2>Traceability Audit & Linkage DAG</h2>
              <p className="review-subtitle">
                Trace structural items across Proposal, Specs, Design, and Tasks.
              </p>
              
              {changesList.length > 0 ? (
                <div className="change-selector-group">
                  <label htmlFor="change-select">Select OpenSpec Change:</label>
                  <select
                    id="change-select"
                    value={selectedChange}
                    onChange={(e) => setSelectedChange(e.target.value)}
                    className="change-select"
                  >
                    {changesList.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="no-changes-msg">No active or archived changes found in this repository.</p>
              )}
            </div>

            {selectedChangeMetadata && (
              <div className="change-metadata-card" id="change-metadata-card">
                <div className="metadata-card-header">
                  <h3>Change Details: {selectedChangeMetadata.name}</h3>
                  <span className="badge badge-info">{selectedChangeMetadata.schema}</span>
                </div>
                
                {selectedChangeMetadata.description && (
                  <p className="metadata-description">{selectedChangeMetadata.description}</p>
                )}

                <div className="metadata-grid">
                  <div className="metadata-item">
                    <span className="metadata-label">Created:</span>
                    <span className="metadata-value">{selectedChangeMetadata.created}</span>
                  </div>

                  <div className="metadata-item">
                    <label htmlFor="propose-engine-select-review" className="metadata-label">AI Propose Engine:</label>
                    <select
                      id="propose-engine-select-review"
                      value={selectedChangeMetadata.proposeEngine}
                      onChange={(e) => handleUpdateEngine(e.target.value)}
                      className="engine-select-review"
                    >
                      <option value="gemini">Gemini (AGY)</option>
                      <option value="claude">Claude Code</option>
                      <option value="cursor">Cursor</option>
                      <option value="codex">Codex</option>
                    </select>
                  </div>
                </div>

                <div className="engine-instructions-panel" id="engine-instructions-panel">
                  {selectedChangeMetadata.proposeEngine === 'gemini' && (
                    <>
                      <div className="instruction-header">Gemini (AGY) Active</div>
                      <p className="instruction-text">
                        Run the following command in Gemini Chat to generate/update change artifacts:
                      </p>
                      <code className="instruction-code">/opsx:propose {selectedChangeMetadata.name}</code>
                    </>
                  )}
                  {selectedChangeMetadata.proposeEngine === 'claude' && (
                    <>
                      <div className="instruction-header">Claude Code Active</div>
                      <p className="instruction-text">
                        Run the following command in your Claude Code console to generate/update change artifacts:
                      </p>
                      <code className="instruction-code">/opsx:propose {selectedChangeMetadata.name}</code>
                    </>
                  )}
                  {selectedChangeMetadata.proposeEngine === 'cursor' && (
                    <>
                      <div className="instruction-header">Cursor Active</div>
                      <p className="instruction-text">
                        Run the following command in Cursor Chat or Composer to generate/update change artifacts:
                      </p>
                      <code className="instruction-code">/opsx-propose {selectedChangeMetadata.name}</code>
                    </>
                  )}
                  {selectedChangeMetadata.proposeEngine === 'codex' && (
                    <>
                      <div className="instruction-header">Codex Active</div>
                      <p className="instruction-text">
                        Run the following command in Codex chat to generate/update change artifacts:
                      </p>
                      <code className="instruction-code">/opsx-propose {selectedChangeMetadata.name}</code>
                    </>
                  )}
                </div>
              </div>
            )}

            {dagLoading && <div className="dag-loading-state loading">Building Linkage DAG...</div>}
            
            {dagError && (
              <div className="message message-danger">
                <p>Failed to build DAG: {dagError}</p>
              </div>
            )}

            {dagData && !dagLoading && <DagViewer dag={dagData} />}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
