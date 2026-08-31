import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { CommandCenter } from './components/CommandCenter';
import { ArtifactViewer } from './components/ArtifactViewer';
import { TaskHub } from './components/TaskHub';
import { TerminalPane } from './components/TerminalPane';
import { AgentHarness } from './components/AgentHarness';
import CreateChangeForm from './components/CreateChangeForm';
import { WorkspaceSelector } from './components/WorkspaceSelector';
import { ChangeItem, TaskItem, Artifacts } from './types';
import { isDrifted, readPinnedContext } from './keystone/pinnedContext';

// For E2E testing, we allow passing the repo path via query param
const urlParams = new URLSearchParams(window.location.search);
const INITIAL_REPO_PATH = urlParams.get('path') || '/tmp/toy-openspec-project';

// C6: build the post-create query string by MERGING into the current params
// instead of replacing them — a bare `?change=...&path=...` reload dropped the
// Keystone pin params (?project=/?sha=), and with them the pinned Deck context
// and drift badge.
export function buildPostCreateSearch(currentSearch: string, changeName: string, repoPath: string): string {
  const params = new URLSearchParams(currentSearch);
  params.set('change', changeName);
  params.set('path', repoPath);
  return params.toString();
}

const EMPTY_ARTIFACTS: Artifacts = { proposal: '', spec: '', design: '', tasks: '' };

function App() {
  const [repoPath, setRepoPath] = useState<string>(INITIAL_REPO_PATH);
  const [changes, setChanges] = useState<ChangeItem[]>([]);
  // Read at mount (not module import) so the ?change= deep link is resolved per
  // component instance.
  const [activeChange, setActiveChange] = useState<string>(
    () => new URLSearchParams(window.location.search).get('change') || 'main'
  );
  const [artifacts, setArtifacts] = useState<Artifacts>(EMPTY_ARTIFACTS);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [agentProvider, setAgentProvider] = useState<string>('codex');
  const [rightPaneWidth, setRightPaneWidth] = useState(320);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [showCreateChange, setShowCreateChange] = useState(false);
  // Keystone CHROME.md v0.2 §1: pin the Deck context this tab was opened with, and
  // flag it the moment the in-tool workspace selection departs from that pin.
  const [keystonePin] = useState(() => readPinnedContext(window.location.search));
  const [keystoneHeadSha, setKeystoneHeadSha] = useState<string | null>(null);

  // HEAD of the selected workspace, read from the manifest endpoint we already serve.
  // Best-effort: without it we still flag project drift, just not commit drift.
  useEffect(() => {
    if (!keystonePin?.sha) return;
    let cancelled = false;
    fetch(`/api/keystone/manifest?path=${encodeURIComponent(repoPath)}`)
      .then(res => (res && res.ok ? res.json() : null))
      .then(data => { if (!cancelled) setKeystoneHeadSha(data?.headSha ?? null); })
      .catch(() => { if (!cancelled) setKeystoneHeadSha(null); });
    return () => { cancelled = true; };
  }, [repoPath, keystonePin]);

  const keystoneDrifted = keystonePin !== null
    && isDrifted(keystonePin, { repo: repoPath, headSha: keystoneHeadSha });

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    const startX = mouseDownEvent.clientX;
    const startWidth = rightPaneWidth;

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
      // Moving mouse left increases width of the right pane
      const deltaX = startX - mouseMoveEvent.clientX;
      setRightPaneWidth(Math.max(250, Math.min(800, startWidth + deltaX)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [rightPaneWidth]);

  const startResizingTerminal = useCallback((mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    const startY = mouseDownEvent.clientY;
    const startHeight = terminalHeight;

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
      const deltaY = startY - mouseMoveEvent.clientY;
      const newHeight = Math.max(120, Math.min(700, startHeight + deltaY));
      setTerminalHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [terminalHeight]);

  // Monotonic request ids + in-flight flag so a slower, older response can
  // never overwrite state written by a newer request (C1), and so the 2s poll
  // can skip ticks while a load is still running.
  const changesRequestIdRef = useRef(0);
  const artifactsRequestIdRef = useRef(0);
  const artifactsInFlightRef = useRef(false);

  const loadChanges = async () => {
    const requestId = ++changesRequestIdRef.current;
    try {
      const res = await fetch(`/api/changes?path=${encodeURIComponent(repoPath)}`);
      if (requestId !== changesRequestIdRef.current) return; // superseded by a newer load
      if (!res.ok) {
        setChanges([]);
        return;
      }
      const data = await res.json();
      if (requestId !== changesRequestIdRef.current) return;
      if (!Array.isArray(data)) {
        // e.g. an {error: ...} body — never hand a non-array to CommandCenter.
        setChanges([]);
        return;
      }
      setChanges(data);
      setActiveChange(prev => (prev === 'main' && data.length > 0 ? data[0].id : prev));
    } catch (e) {
      if (requestId === changesRequestIdRef.current) setChanges([]);
      console.error(e);
    }
  };

  const loadArtifacts = async (changeName: string) => {
    // Bump the request id even for 'main' so an in-flight fetch for a
    // previously-selected change is invalidated the moment the user leaves it.
    const requestId = ++artifactsRequestIdRef.current;
    if (changeName === 'main') {
      artifactsInFlightRef.current = false;
      return;
    }
    artifactsInFlightRef.current = true;
    try {
      // 30s timeout: a hung request must not wedge the in-flight flag (and
      // with it the poll) forever.
      const res = await fetch(`/api/artifacts?path=${encodeURIComponent(repoPath)}&change=${encodeURIComponent(changeName)}`, { signal: AbortSignal.timeout(30_000) });
      if (requestId !== artifactsRequestIdRef.current) return; // stale: superseded by a newer load
      if (!res.ok) {
        // e.g. the change doesn't exist in this workspace — don't leave the
        // previous workspace's artifacts on screen.
        setArtifacts(EMPTY_ARTIFACTS);
        setTasks([]);
        setFiles([]);
        return;
      }
      const data = await res.json();
      if (requestId !== artifactsRequestIdRef.current) return; // stale
      if (data.artifacts) {
        setArtifacts({
          ...data.artifacts,
          linkages: data.linkages || []
        });
        setTasks(data.parsedTasks || []);
        setFiles(data.files || []);
        if (data.agentProvider) {
          setAgentProvider(data.agentProvider);
        }
      } else {
        setArtifacts(EMPTY_ARTIFACTS);
        setTasks([]);
        setFiles([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (requestId === artifactsRequestIdRef.current) {
        artifactsInFlightRef.current = false;
      }
    }
  };

  const prevRepoPathRef = useRef(repoPath);
  useEffect(() => {
    // Compare paths instead of a boolean "first run" flag: under StrictMode
    // mount effects run twice with refs preserved, and a boolean would fire
    // the reset on the second run, wiping a ?change= deep link.
    if (prevRepoPathRef.current !== repoPath) {
      prevRepoPathRef.current = repoPath;
      // Workspace switch: drop the previous workspace's selection and artifact
      // state immediately so nothing stale stays on screen while the new repo loads.
      setActiveChange('main');
      setChanges([]);
      setArtifacts(EMPTY_ARTIFACTS);
      setTasks([]);
      setFiles([]);
      setAgentProvider('codex');
    }
    loadChanges();
  }, [repoPath]);

  useEffect(() => {
    loadArtifacts(activeChange);

    // Auto-polling every 2 seconds; skip the tick while a load is in flight
    // so requests can't pile up when latency exceeds the poll interval.
    const interval = setInterval(() => {
      if (!artifactsInFlightRef.current) {
        loadArtifacts(activeChange);
      }
    }, 2000);
    
    // Update URL state
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('change', activeChange);
    window.history.replaceState({}, '', newUrl);

    return () => clearInterval(interval);
  }, [activeChange, repoPath]);

  const executeCommand = async (command: string, args: string[] = []) => {
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath, command, args })
      });
      // Drain the streamed response to completion; the output is discarded
      // (the old write-only terminalLines log it fed was removed with C16).
      const reader = res.body?.getReader();
      if (reader) {
        while (!(await reader.read()).done) { /* drain */ }
      }
      // Reload artifacts after execution
      loadArtifacts(activeChange);
    } catch (e: any) {
      console.error('execute failed:', e);
    }
  };

  // Reached only from TerminalPane's socket-DISCONNECTED fallback (when the
  // socket is up, prompt input goes straight to the PTY). The pre-PTY agent
  // layer (attach detection, /api/send-message routing, Attach button) was
  // removed in C16: it was unreachable in production, and agent interaction
  // works by typing `tmux attach` in the PTY itself.
  const handleRunTerminalCommand = async (fullCommand: string) => {
    const trimmed = fullCommand.trim();
    if (!trimmed) return;

    // No-op: nothing client-side to clear (the old log is gone), and the
    // server allowlists a `clear` binary that would spawn into the void.
    if (trimmed === 'clear') return;

    const parts = trimmed.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    await executeCommand(command, args);
  };

  const handleProviderChange = async (provider: string) => {
    setAgentProvider(provider);
    if (activeChange === 'main') return;
    try {
      await fetch(`/api/changes/${encodeURIComponent(activeChange)}/provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath, provider })
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div 
      className="workspace"
      style={{
        gridTemplateColumns: `260px 1fr ${rightPaneWidth}px`,
        gridTemplateRows: `50px 1fr 6px ${terminalHeight}px`
      }}
    >
      <header>
        <div className="header-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          OpenSpec
          <span className="badge">v2.0 (Deterministic)</span>
        </div>
        {keystonePin && (
          <div className="keystone-context" title="Pinned Deck context (CHROME.md §1)">
            <span className="keystone-pin">
              {keystonePin.project}{keystonePin.sha ? ` @ ${keystonePin.sha.slice(0, 7)}` : ''}
            </span>
            {keystoneDrifted && (
              <span
                className="keystone-drift"
                title="The selected workspace departs from the project/commit this tab was opened with"
              >
                drifted from Deck context
              </span>
            )}
          </div>
        )}
        <div id="workspace-header">
          <WorkspaceSelector
            currentPath={repoPath}
            onSelectPath={(newPath) => {
              setRepoPath(newPath);
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.set('path', newPath);
              window.history.pushState({}, '', newUrl);
            }}
          />
        </div>
      </header>
      
      <CommandCenter 
        changes={changes} 
        activeChange={activeChange} 
        setActiveChange={setActiveChange}
        executeCommand={executeCommand}
        agentProvider={agentProvider}
        onProviderChange={handleProviderChange}
        onNewChangeClick={() => setShowCreateChange(true)}
      />
      <ArtifactViewer artifacts={artifacts} tasks={tasks} files={files} activeChange={activeChange} repoPath={repoPath} />
      <div className="right-pane">
        <div className="pane-resizer" onMouseDown={startResizing} />
        <TaskHub tasks={tasks} />
        <AgentHarness 
          repoPath={repoPath} 
          activeChange={activeChange} 
          agentProvider={agentProvider}
          artifacts={artifacts}
        />
      </div>
      <div className="terminal-resizer" onMouseDown={startResizingTerminal} title="Drag to resize terminal height" />
      <TerminalPane onExecuteCommand={handleRunTerminalCommand} terminalHeight={terminalHeight} />
      
      {showCreateChange && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-card" style={{
            background: 'var(--bg-secondary)', padding: '20px', borderRadius: '8px', 
            width: '500px', maxWidth: '90%', border: '1px solid var(--border-color)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Create New Change</h2>
              <button onClick={() => setShowCreateChange(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px' }}>
                ×
              </button>
            </div>
            <CreateChangeForm
              repoPath={repoPath}
              onCreateSuccess={(changeName) => {
                setShowCreateChange(false);
                window.location.search = buildPostCreateSearch(window.location.search, changeName, repoPath);
              }}
              onCancel={() => setShowCreateChange(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
