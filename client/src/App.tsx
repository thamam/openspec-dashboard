import React, { useState } from 'react';
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
        )}
      </main>
    </div>
  );
}

export default App;
