import React, { useState, useEffect, useRef } from 'react';
import './WorkspaceSelector.css';

interface WorkspaceSelectorProps {
  currentPath: string;
  onSelectPath: (newPath: string) => void;
}

const STORAGE_KEY = 'openspec_recent_workspaces';
const MAX_RECENTS = 8;

const loadRecentsFromStorage = (): string[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Failed to load recent workspaces:', e);
  }
  return [];
};

export function WorkspaceSelector({ currentPath, onSelectPath }: WorkspaceSelectorProps) {
  const [inputPath, setInputPath] = useState(currentPath);
  const [recents, setRecents] = useState<string[]>(loadRecentsFromStorage);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync internal input if prop changes
  useEffect(() => {
    setInputPath(currentPath);
    addRecent(currentPath);
  }, [currentPath]);

  // Save recents to localStorage
  const saveRecents = (list: string[]) => {
    setRecents(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Failed to save recent workspaces:', e);
    }
  };

  const addRecent = (pathToAdd: string) => {
    const trimmed = pathToAdd.trim();
    if (!trimmed) return;

    setRecents((prev) => {
      const filtered = prev.filter((p) => p !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, MAX_RECENTS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save recent workspaces:', e);
      }
      return updated;
    });
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [browsing, setBrowsing] = useState(false);

  const handleLoad = () => {
    const trimmed = inputPath.trim();
    if (trimmed) {
      addRecent(trimmed);
      onSelectPath(trimmed);
      setDropdownOpen(false);
    }
  };

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const res = await fetch('/api/browse-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPath: inputPath }),
      });
      const data = await res.json();
      if (data.success && data.path) {
        setInputPath(data.path);
        addRecent(data.path);
        onSelectPath(data.path);
      }
    } catch (err) {
      console.error('Failed to open native folder chooser:', err);
    } finally {
      setBrowsing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLoad();
    }
  };

  const handleSelectRecent = (path: string) => {
    setInputPath(path);
    addRecent(path);
    onSelectPath(path);
    setDropdownOpen(false);
  };

  const handleClearRecents = (e: React.MouseEvent) => {
    e.stopPropagation();
    saveRecents([]);
  };

  return (
    <div className="workspace-selector-container" ref={dropdownRef}>
      <label className="workspace-label">Workspace:</label>
      
      <div className="workspace-input-wrapper">
        <svg className="workspace-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <input
          type="text"
          className="workspace-path-input"
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. ~/projects/my-repo or /path/to/repo"
        />
      </div>

      <button className="btn-load-workspace" onClick={handleLoad} title="Load workspace path">
        Load
      </button>

      <button className="btn-browse-workspace" onClick={handleBrowse} disabled={browsing} title="Browse folders starting from Home directory">
        {browsing ? 'Opening...' : 'Browse...'}
      </button>

      <div className="recent-workspaces-dropdown-wrapper">
        <button
          className={`btn-recent-dropdown ${dropdownOpen ? 'active' : ''}`}
          onClick={() => setDropdownOpen((prev) => !prev)}
          title="Recent workspaces"
        >
          Recent
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        {dropdownOpen && (
          <div className="recent-workspaces-menu">
            <div className="menu-header">
              <span>Recent Workspaces</span>
              {recents.length > 0 && (
                <button className="btn-clear-history" onClick={handleClearRecents}>
                  Clear
                </button>
              )}
            </div>

            {recents.length === 0 ? (
              <div className="menu-empty">No recent workspaces</div>
            ) : (
              <div className="menu-list">
                {recents.map((path) => (
                  <button
                    key={path}
                    className={`menu-item ${path === currentPath ? 'current' : ''}`}
                    onClick={() => handleSelectRecent(path)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span className="menu-item-path" title={path}>{path}</span>
                    {path === currentPath && <span className="current-tag">Active</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
