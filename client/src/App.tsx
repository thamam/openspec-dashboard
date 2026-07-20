import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { CommandCenter } from './components/CommandCenter';
import { ArtifactViewer } from './components/ArtifactViewer';
import { TaskHub } from './components/TaskHub';
import { TerminalPane } from './components/TerminalPane';
import { ChangeItem, TaskItem, Artifacts } from './types';

// For E2E testing, we allow passing the repo path via query param
const urlParams = new URLSearchParams(window.location.search);
const REPO_PATH = urlParams.get('path') || '/tmp/toy-openspec-project';

function App() {
  const [changes, setChanges] = useState<ChangeItem[]>([]);
  const [activeChange, setActiveChange] = useState<string>('main');
  const [artifacts, setArtifacts] = useState<Artifacts>({ proposal: '', spec: '', design: '', tasks: '' });
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [terminalLines, setTerminalLines] = useState<string[]>(['OpenSpec CLI v1.2.0 (Deterministic Engine)']);

  const loadChanges = async () => {
    try {
      const res = await fetch(`http://localhost:3011/api/changes?path=${encodeURIComponent(REPO_PATH)}`);
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
      const res = await fetch(`http://localhost:3011/api/artifacts?path=${encodeURIComponent(REPO_PATH)}&change=${encodeURIComponent(changeName)}`);
      const data = await res.json();
      if (data.artifacts) {
        setArtifacts(data.artifacts);
        setTasks(data.parsedTasks || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadChanges();
  }, []);

  useEffect(() => {
    loadArtifacts(activeChange);
  }, [activeChange]);

  const executeCommand = async (command: string, args: string[] = []) => {
    setTerminalLines(prev => [...prev, `$ ${command} ${args.join(' ')}`]);
    try {
      const res = await fetch('http://localhost:3011/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: REPO_PATH, command, args })
      });
      
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        setTerminalLines(prev => [...prev, ...text.split('\n')]);
      }
      // Reload artifacts after execution
      loadArtifacts(activeChange);
    } catch (e: any) {
      setTerminalLines(prev => [...prev, `ERROR: ${e.message}`]);
    }
  };

  return (
    <div className="workspace">
      <header>
        <div className="header-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          OpenSpec
          <span className="badge">v2.0 (Deterministic)</span>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }} id="workspace-header">
          Workspace: {REPO_PATH}
        </div>
      </header>
      
      <CommandCenter 
        changes={changes} 
        activeChange={activeChange} 
        setActiveChange={setActiveChange}
        executeCommand={executeCommand}
      />
      <ArtifactViewer artifacts={artifacts} tasks={tasks} />
      <TaskHub tasks={tasks} />
      <TerminalPane lines={terminalLines} />
    </div>
  );
}

export default App;
