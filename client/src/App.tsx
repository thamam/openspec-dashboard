import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { CommandCenter } from './components/CommandCenter';
import { ArtifactViewer } from './components/ArtifactViewer';
import { TaskHub } from './components/TaskHub';
import { TerminalPane } from './components/TerminalPane';
import { AgentHarness } from './components/AgentHarness';
import CreateChangeForm from './components/CreateChangeForm';
import { WorkspaceSelector } from './components/WorkspaceSelector';
import { ChangeItem, TaskItem, Artifacts } from './types';

// For E2E testing, we allow passing the repo path via query param
const urlParams = new URLSearchParams(window.location.search);
const INITIAL_REPO_PATH = urlParams.get('path') || '/tmp/toy-openspec-project';
const INITIAL_CHANGE = urlParams.get('change') || 'main';

function App() {
  const [repoPath, setRepoPath] = useState<string>(INITIAL_REPO_PATH);
  const [changes, setChanges] = useState<ChangeItem[]>([]);
  const [activeChange, setActiveChange] = useState<string>(INITIAL_CHANGE);
  const [artifacts, setArtifacts] = useState<Artifacts>({ proposal: '', spec: '', design: '', tasks: '' });
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [terminalLines, setTerminalLines] = useState<string[]>(['OpenSpec CLI v1.2.0 (Deterministic Engine)']);
  const [agentProvider, setAgentProvider] = useState<string>('antigravity');
  const [rightPaneWidth, setRightPaneWidth] = useState(320);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [showCreateChange, setShowCreateChange] = useState(false);

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

  const loadChanges = async () => {
    try {
      const res = await fetch(`/api/changes?path=${encodeURIComponent(repoPath)}`);
      const data = await res.json();
      setChanges(data);
      if (data.length > 0 && activeChange === 'main') {
        setActiveChange(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadArtifacts = async (changeName: string) => {
    if (changeName === 'main') return;
    try {
      const res = await fetch(`/api/artifacts?path=${encodeURIComponent(repoPath)}&change=${encodeURIComponent(changeName)}`);
      const data = await res.json();
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
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadChanges();
  }, [repoPath]);

  useEffect(() => {
    loadArtifacts(activeChange);
    
    // Auto-polling every 2 seconds
    const interval = setInterval(() => {
      loadArtifacts(activeChange);
    }, 2000);
    
    // Update URL state
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('change', activeChange);
    window.history.replaceState({}, '', newUrl);

    return () => clearInterval(interval);
  }, [activeChange, repoPath]);

  const cleanAnsiText = (text: string) => {
    return text
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
      .replace(/\r/g, '');
  };

  const captureTmuxPane = async (sessionName: string) => {
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath, command: 'tmux', args: ['capture-pane', '-pt', sessionName] })
      });
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
      const cleaned = cleanAnsiText(text);
      const paneLines = cleaned
        .split('\n')
        .map(l => l.trimEnd())
        .filter(l => l.length > 0);

      setTerminalLines(prev => {
        const marker = `--- Active Session: ${sessionName} ---`;
        const existingIdx = prev.findIndex(line => line.startsWith('--- Active Session:'));
        if (existingIdx !== -1) {
          return [
            ...prev.slice(0, existingIdx),
            marker,
            ...paneLines
          ];
        }
        return [
          ...prev,
          marker,
          ...paneLines
        ];
      });
    } catch (e: any) {
      console.error('Failed to capture tmux pane:', e);
    }
  };

  const executeCommand = async (command: string, args: string[] = []) => {
    if (command === 'tmux' && args.includes('attach')) {
      const sessionIdx = args.indexOf('-t');
      const sessionName = sessionIdx !== -1 && args[sessionIdx + 1] ? args[sessionIdx + 1] : '';
      if (sessionName) {
        await captureTmuxPane(sessionName);
        return;
      }
    }

    const fullCmdDisplay = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    setTerminalLines(prev => [...prev, `$ ${fullCmdDisplay}`]);
    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath, command, args })
      });
      
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const cleaned = cleanAnsiText(text);
        const newLines = cleaned.split('\n').filter((line, idx, arr) => {
          // Skip consecutive empty lines at the chunk boundary
          if (!line.trim() && idx > 0 && !arr[idx - 1].trim()) return false;
          return true;
        });
        setTerminalLines(prev => [...prev, ...newLines]);
      }
      // Reload artifacts after execution
      loadArtifacts(activeChange);
    } catch (e: any) {
      setTerminalLines(prev => [...prev, `ERROR: ${e.message}`]);
    }
  };

  const handleRunTerminalCommand = async (fullCommand: string) => {
    const trimmed = fullCommand.trim();
    if (!trimmed) return;

    if (trimmed === 'clear') {
      setTerminalLines([]);
      return;
    }

    // Find the latest active agent session from terminal logs
    let activeSession = '';
    for (let i = terminalLines.length - 1; i >= 0; i--) {
      const match = terminalLines[i].match(/(openspec-session-[0-9]+|agent-[0-9]+)/);
      if (match) {
        // Check if the session process exited after this line
        let exited = false;
        for (let j = i + 1; j < terminalLines.length; j++) {
          if (terminalLines[j].includes('[Process exited with code')) {
            exited = true;
            break;
          }
        }
        if (!exited) {
          activeSession = match[0];
        }
        break;
      }
    }

    // If an agent tmux session is active and user is not explicitly running a local tool command
    const isExplicitLocalCmd = trimmed.startsWith('opsx-') || trimmed.startsWith('git ') || trimmed.startsWith('openspec ') || trimmed.startsWith('cd ') || trimmed.startsWith('ls ') || trimmed.startsWith('pwd');

    if (activeSession && !isExplicitLocalCmd && trimmed !== 'exit' && trimmed !== 'disconnect') {
      setTerminalLines(prev => [...prev, `$ [${activeSession}] ${trimmed}`]);
      try {
        const res = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionName: activeSession, message: trimmed })
        });
        const data = await res.json();
        if (data.error) {
          setTerminalLines(prev => [...prev, `ERROR: ${data.error}`]);
        } else {
          // Capture the updated tmux pane output after 400ms
          setTimeout(() => captureTmuxPane(activeSession), 400);
        }
      } catch (e: any) {
        setTerminalLines(prev => [...prev, `ERROR: ${e.message}`]);
      }
      return;
    }

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
      <ArtifactViewer artifacts={artifacts} tasks={tasks} files={files} activeChange={activeChange} />
      <div className="right-pane">
        <div className="pane-resizer" onMouseDown={startResizing} />
        <TaskHub tasks={tasks} />
        <AgentHarness repoPath={repoPath} activeChange={activeChange} />
      </div>
      <div className="terminal-resizer" onMouseDown={startResizingTerminal} title="Drag to resize terminal height" />
      <TerminalPane lines={terminalLines} onExecuteCommand={handleRunTerminalCommand} terminalHeight={terminalHeight} />
      
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
                window.location.search = `?change=${encodeURIComponent(changeName)}&path=${encodeURIComponent(repoPath)}`;
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
