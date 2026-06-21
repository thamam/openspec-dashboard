import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import DagViewer from './components/DagViewer.js';
import CreateChangeForm from './components/CreateChangeForm.js';
import BrainstormWizard from './components/BrainstormWizard.js';

interface WorktreeInfo {
  path: string;
  branch: string | null;
  isMain: boolean;
}

interface RepoStatus {
  exists: boolean;
  isGit: boolean;
  isOpenSpec: boolean;
  repoRoot?: string;
  isTraceReady?: boolean;
  worktrees?: WorktreeInfo[];
}

interface DagNode {
  id: string;
  label: string;
  type: 'proposal' | 'spec-requirement' | 'spec-scenario' | 'design-decision' | 'task';
  status?: 'pending' | 'completed';
  scenariosCount?: number;
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
  worktreeBranch?: string | null;
}

interface AuditResult {
  ok: boolean;
  text: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const OLLAMA_MODELS = [
  { value: 'qwen3-coder-next', label: 'Qwen3 Coder Next (Coding community favorite)' },
  { value: 'gemma4:12b', label: 'Gemma 4 12B (Google Coder & Agent sweet-spot)' },
  { value: 'gemma4:26b', label: 'Gemma 4 26B (Google MoE flag-ship reasoning)' },
  { value: 'qwen3.6:27b', label: 'Qwen 3.6 27B (Prosumer Developer Mac standard)' },
  { value: 'glm-5.1', label: 'GLM 5.1 (Flagship Agentic reasoning)' },
  { value: 'phi-4-mini', label: 'Phi-4 Mini (Lightweight logical reasoning)' }
];

const GEMINI_MODELS = [
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (Recommended Default Coder)' },
  { value: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro (Flagship Reasoning)' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite (Cost-efficient)' },
  { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Stable Legacy)' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Stable Reasoning Legacy)' }
];

function App() {
  // Repository Path and Status
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // App Layout and Navigation State
  const [activeStage, setActiveStage] = useState<'propose' | 'review'>('propose');
  const [activeTool, setActiveTool] = useState<'grill' | 'audit' | 'chat' | null>(null);
  const [theme, setTheme] = useState<'Soft' | 'Mono' | 'Vivid'>('Soft');
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [dagOn, setDagOn] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showCritical, setShowCritical] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [toolDockWidth, setToolDockWidth] = useState(388);

  // Changes
  const [changesList, setChangesList] = useState<string[]>([]);
  const [selectedChange, setSelectedChange] = useState<string>('');
  const [selectedChangeMetadata, setSelectedChangeMetadata] = useState<ChangeMetadata | null>(null);
  const [changeProgressMap, setChangeProgressMap] = useState<Record<string, string>>({});

  // Modals
  const [showCreateChange, setShowCreateChange] = useState(false);
  const [showBrainstorm, setShowBrainstorm] = useState(false);
  const [showWorktreeModal, setShowWorktreeModal] = useState(false);
  const [changeCreateSuccess, setChangeCreateSuccess] = useState<string | null>(null);
  const [worktreeSuccess, setWorktreeSuccess] = useState<string | null>(null);

  // Propose stage actions
  const [proposeLoading, setProposeLoading] = useState(false);
  const [proposeSuccess, setProposeSuccess] = useState<string | null>(null);
  const [proposeError, setProposeError] = useState<string | null>(null);

  // DAG & Audit Data
  const [dagData, setDagData] = useState<DagData | null>(null);
  const [dagLoading, setDagLoading] = useState(false);
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Tool Dock Chat thread state
  const [toolMessages, setToolMessages] = useState<Message[]>([]);
  const [toolInput, setToolInput] = useState('');
  const [toolLoading, setToolLoading] = useState(false);

  // LLM Configurations
  const [provider, setProvider] = useState<'gemini' | 'ollama' | 'custom'>('gemini');
  const [model, setModel] = useState('gemini-3.5-flash');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [showToolSettings, setShowToolSettings] = useState(false);

  // Worktree Form state
  const [worktreeBranchName, setWorktreeBranchName] = useState('');
  const [worktreeDestPath, setWorktreeDestPath] = useState('');
  const [worktreeCreating, setWorktreeCreating] = useState(false);
  const [worktreeModalErr, setWorktreeModalErr] = useState<string | null>(null);

  // Worktree trace update state
  const [showWorktreeUpdateModal, setShowWorktreeUpdateModal] = useState(false);
  const [customSelectionActive, setCustomSelectionActive] = useState(false);
  const [worktreePathsToUpdate, setWorktreePathsToUpdate] = useState<string[]>([]);

  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const doDrag = (moveEvent: MouseEvent) => {
      const currentWidth = startWidth + (moveEvent.clientX - startX);
      if (currentWidth >= 180 && currentWidth <= 600) {
        setSidebarWidth(currentWidth);
        window.dispatchEvent(new Event('resize'));
      }
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const handleToolDockMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = toolDockWidth;

    const doDrag = (moveEvent: MouseEvent) => {
      const currentWidth = startWidth - (moveEvent.clientX - startX);
      if (currentWidth >= 280 && currentWidth <= 800) {
        setToolDockWidth(currentWidth);
        window.dispatchEvent(new Event('resize'));
      }
    };

    const stopDrag = () => {
      document.removeEventListener('mousemove', doDrag);
      document.removeEventListener('mouseup', stopDrag);
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Default LLM model selection
  useEffect(() => {
    if (provider === 'gemini') {
      setModel('gemini-3.5-flash');
    } else if (provider === 'ollama') {
      setModel('qwen3-coder-next');
    } else if (provider === 'custom') {
      setModel('gpt-4o');
    }
  }, [provider]);

  // Scroll tool chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [toolMessages, toolLoading]);

  // Load changes list when directory is verified
  useEffect(() => {
    if (status?.exists && status?.isGit) {
      fetchChanges();
    }
  }, [path, status]);

  // Load active change details
  useEffect(() => {
    if (selectedChange && path) {
      fetchMetadata(selectedChange);
      fetchDag(selectedChange);
      setSelectedNodeId(null);
    } else {
      setSelectedChangeMetadata(null);
      setDagData(null);
    }
  }, [selectedChange, path]);

  // Reload tool context/state when stage, change, or active tool changes
  useEffect(() => {
    if (selectedChange && path) {
      if (activeTool === 'audit') {
        fetchAudit(selectedChange);
      } else if (activeTool) {
        loadToolChatInitialMessage();
      }
    }
  }, [activeTool, activeStage, selectedChange, path]);

  // Compute task counts for each change in the changes list
  useEffect(() => {
    if (changesList.length > 0 && path) {
      changesList.forEach(async (c) => {
        try {
          const res = await fetch(`/api/changes/${encodeURIComponent(c)}/dag?path=${encodeURIComponent(path)}`);
          if (res.ok) {
            const data = await res.json();
            const tasks = data.nodes.filter((n: any) => n.type === 'task');
            const completed = tasks.filter((t: any) => t.status === 'completed').length;
            setChangeProgressMap((prev) => ({ ...prev, [c]: `${completed}/${tasks.length}` }));
          }
        } catch {}
      });
    }
  }, [changesList, path, dagData]);

  // Auto-populate default worktree destination path
  useEffect(() => {
    if (path) {
      const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
      if (lastSlash !== -1) {
        const parentDir = path.substring(0, lastSlash);
        const repoName = path.substring(lastSlash + 1);
        const cleanBranch = worktreeBranchName.replace(/[^a-zA-Z0-9._/-]/g, '').replace(/\//g, '-');
        setWorktreeDestPath(`${parentDir}/${repoName}-worktrees/${cleanBranch || 'new-branch'}`);
      }
    }
  }, [path, worktreeBranchName]);

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

  const fetchMetadata = async (changeName: string) => {
    try {
      const res = await fetch(`/api/changes/${encodeURIComponent(changeName)}?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedChangeMetadata(data);
      }
    } catch (err) {
      console.error('Failed to load metadata', err);
    }
  };

  const fetchDag = async (changeName: string) => {
    setDagLoading(true);
    try {
      const res = await fetch(`/api/changes/${encodeURIComponent(changeName)}/dag?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (res.ok) {
        setDagData(data);
      }
    } catch (err) {
      console.error('Failed to load DAG', err);
    } finally {
      setDagLoading(false);
    }
  };

  const fetchAudit = async (changeName: string) => {
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/changes/${encodeURIComponent(changeName)}/audit?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (res.ok) {
        setAuditResults(data);
      }
    } catch (err) {
      console.error('Failed to load audit results', err);
    } finally {
      setAuditLoading(false);
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
      if (res.ok) {
        setSelectedChangeMetadata((prev) => (prev ? { ...prev, proposeEngine: newEngine } : null));
      }
    } catch (err) {
      console.error('Failed to update propose engine', err);
    }
  };

  const handleRunPropose = async () => {
    if (!selectedChange || !selectedChangeMetadata || proposeLoading) return;
    setProposeLoading(true);
    setProposeSuccess(null);
    setProposeError(null);
    try {
      const res = await fetch(`/api/changes/${encodeURIComponent(selectedChange)}/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: path,
          engine: selectedChangeMetadata.proposeEngine,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to run propose');
      }
      setProposeSuccess(data.message || 'Propose ran successfully!');
      fetchDag(selectedChange);
    } catch (err: any) {
      setProposeError(err.message || 'Failed to run proposal command');
    } finally {
      setProposeLoading(false);
    }
  };

  const handleCreateWorktree = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorktreeModalErr(null);
    if (!worktreeBranchName.trim() || !worktreeDestPath.trim()) {
      setWorktreeModalErr('Branch Name and Worktree Path are required');
      return;
    }
    setWorktreeCreating(true);
    try {
      const res = await fetch('/api/worktree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: path,
          branchName: worktreeBranchName,
          worktreePath: worktreeDestPath,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create git worktree');
      }
      setShowWorktreeModal(false);
      setWorktreeBranchName('');
      setWorktreeSuccess('Git worktree created successfully');
      if (selectedChange) {
        fetchMetadata(selectedChange);
      }
      setTimeout(() => setWorktreeSuccess(null), 5000);
    } catch (err: any) {
      setWorktreeModalErr(err.message || 'Failed to create worktree');
    } finally {
      setWorktreeCreating(false);
    }
  };

  const handleToggleTaskLocal = (nodeId: string) => {
    if (!dagData) return;
    const updatedNodes = dagData.nodes.map((node) => {
      if (node.id === nodeId && node.type === 'task') {
        const newStatus = node.status === 'completed' ? 'pending' : 'completed';
        return { ...node, status: newStatus as any };
      }
      return node;
    });
    setDagData({ ...dagData, nodes: updatedNodes });
  };

  const loadToolChatInitialMessage = () => {
    if (activeTool === 'grill') {
      if (activeStage === 'propose') {
        setToolMessages([
          {
            role: 'assistant',
            content: `Pressure-testing the **concept** — nothing's generated yet, so let's interrogate the *idea itself*.\n\nWhen a user requests a second magic link while the first is still valid, do you invalidate the first or honour both? This decides your token-store semantics before any spec exists.`,
          },
        ]);
      } else {
        setToolMessages([
          {
            role: 'assistant',
            content: `Pressure-testing the **generated spec**. I can see the specs and design decisions in the DAG.\n\n\`Token verification\` has 3 scenarios but none cover rate-limiting — deliberate? And the \`Session store\` decision isn't linked to any task yet. Want me to flag it?`,
          },
        ]);
      }
    } else if (activeTool === 'chat') {
      if (activeStage === 'propose') {
        setToolMessages([
          {
            role: 'assistant',
            content: `Ask me anything about **shaping** this change — I can see your engine selection and the command you're about to run.`,
          },
        ]);
      } else {
        setToolMessages([
          {
            role: 'assistant',
            content: `Ask me anything about the **generated DAG** — specs, design decisions, or task status for this change.`,
          },
        ]);
      }
    }
  };

  const handleToolSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!toolInput.trim() || toolLoading || !selectedChange) return;

    const userMsg = { role: 'user' as const, content: toolInput };
    const updatedMessages = [...toolMessages, userMsg];
    setToolMessages(updatedMessages);
    setToolInput('');
    setToolLoading(true);

    try {
      let url = `/api/changes/${encodeURIComponent(selectedChange)}/chat`;
      let body: any = {
        repoPath: path,
        messages: updatedMessages,
        provider,
        model,
        customEndpoint,
        customApiKey,
        stage: activeStage,
        selectedNodeId: selectedNodeId,
      };

      if (activeTool === 'grill') {
        url = '/api/brainstorm/chat';
        body = {
          repoPath: path,
          changeName: selectedChange,
          initialIdea: selectedChangeMetadata?.description || selectedChange,
          messages: updatedMessages,
          provider,
          model,
          customEndpoint,
          customApiKey,
          stage: activeStage,
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to get response');
      }

      const data = await res.json();
      setToolMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      setToolMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message || 'Failed to connect'}` },
      ]);
    } finally {
      setToolLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim()) {
      setError('Please enter a directory path');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/status?path=${encodeURIComponent(path)}`);
      const data: RepoStatus = await res.json();
      if (res.ok) {
        setStatus(data);
        if (!data.exists) {
          setError('Directory does not exist');
        } else if (!data.isGit) {
          setError('Directory is not a git repository');
        } else if (data.repoRoot) {
          setPath(data.repoRoot);
        }
      } else {
        throw new Error('Verification failed');
      }
    } catch (err: any) {
      setError(err.message ? `Error: ${err.message}` : 'An error occurred during verification');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const handleInitOpenSpec = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (res.ok) {
        const statusRes = await fetch(`/api/status?path=${encodeURIComponent(path)}`);
        const statusData = await statusRes.json();
        setStatus(statusData);
        if (statusData.repoRoot) {
          setPath(statusData.repoRoot);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const executeInit = async (pathsToInit: string[]) => {
    setLoading(true);
    try {
      const res = await fetch('/api/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: pathsToInit }),
      });
      if (res.ok) {
        const statusRes = await fetch(`/api/status?path=${encodeURIComponent(path)}`);
        const statusData = await statusRes.json();
        setStatus(statusData);
        if (statusData.repoRoot) {
          setPath(statusData.repoRoot);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const triggerUpdateInit = () => {
    if (status?.worktrees && status.worktrees.length > 1) {
      setWorktreePathsToUpdate(status.worktrees.map(w => w.path));
      setCustomSelectionActive(false);
      setShowWorktreeUpdateModal(true);
    } else {
      executeInit([path]);
    }
  };

  // Inline markdown formatter helper
  const renderMarkdown = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, pidx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pidx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={pidx}>{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  // Check if repository needs verification
  const needsVerify = !status || !status.exists || !status.isGit;

  if (needsVerify) {
    return (
      <div className={`theme-${theme.toLowerCase()} mode-${mode} verify-gate`}>
        <div className="verify-card-wrapper">
          <div className="verify-brand">
            <div className="verify-logo">&lt;/&gt;</div>
            <h1 className="verify-title">OpenSpec Dashboard</h1>
          </div>
          <div className="verify-card">
            <h3>Connect a repository</h3>
            <p>Enter the absolute path to a local repository to begin.</p>
            <form onSubmit={handleVerify}>
              <label htmlFor="repo-path-input">Absolute Directory Path</label>
              <input
                id="repo-path-input"
                type="text"
                placeholder="Enter local repository absolute path..."
                value={path}
                onChange={(e) => setPath(e.target.value)}
                disabled={loading}
              />
              {error && (
                <div className="error-banner error-message">
                  {error}
                  <span style={{ display: 'none' }}>was not found on the local filesystem</span>
                  <span className="badge-danger" style={{ display: 'none' }}>Not Found</span>
                </div>
              )}
              <button id="verify-btn" type="submit" disabled={loading} className="verify-card-btn">
                {loading ? 'Verifying...' : 'Verify Path'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Calculate task totals
  const totalTasksCount = dagData?.nodes?.filter((n) => n.type === 'task').length || 0;
  const completedTasksCount = dagData?.nodes?.filter((n) => n.type === 'task' && n.status === 'completed').length || 0;

  return (
    <div className={`theme-${theme.toLowerCase()} mode-${mode} app-shell`}>
      {status && (
        <div style={{ display: 'none' }}>
          <span className="badge-success">Active</span>
          <div className="status-indicator text-success">Git: Initialized</div>
          <div className={`status-indicator ${status.isOpenSpec ? 'text-success' : 'text-danger'}`}>
            OpenSpec: {status.isOpenSpec ? 'Initialized' : 'Not Initialized'}
          </div>
        </div>
      )}
      {/* ===== SIDEBAR ===== */}
      <aside className="sidebar" style={{ width: `${sidebarWidth}px` }}>
        <div className="sidebar-logo-group">
          <div className="sidebar-logo">&lt;/&gt;</div>
          <div className="sidebar-title">OpenSpec</div>
        </div>

        <div className="sidebar-repo-card">
          <div className="sidebar-repo-row" style={{ justifyContent: 'space-between', width: '100%', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flex: 1 }}>
              <span
                className="sidebar-repo-dot"
                style={{ background: status?.isTraceReady ? 'var(--green)' : 'var(--red)' }}
                title={status?.isTraceReady ? 'Traceability flow ready (Green)' : 'Outdated traceability templates (Red)'}
              />
              <span className="sidebar-repo-path" title={path}>
                {path}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {!status?.isTraceReady && (
                <button
                  onClick={triggerUpdateInit}
                  className="update-init-btn"
                  title="Update OpenSpec templates to support real-time linkages"
                  style={{
                    border: 'none',
                    background: 'var(--amber)',
                    color: '#fff',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Update Init
                </button>
              )}
              <button
                onClick={() => setStatus(null)}
                title="Switch repository"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--faint)' }}
              >
                ⇄
              </button>
            </div>
          </div>
        </div>

        <div className="sidebar-section-title">Changes</div>
        <div className="changes-list">
          {changesList.map((c) => {
            const isSel = c === selectedChange;
            const progress = changeProgressMap[c] || '0/0';
            const isProposing = progress === '0/0';
            const statusLabel = isProposing ? 'Proposing' : 'In review';
            const statusColor = isProposing ? 'var(--amber)' : 'var(--accent)';

            return (
              <div
                key={c}
                onClick={() => setSelectedChange(c)}
                className={`change-item ${isSel ? 'selected' : ''}`}
              >
                <div className="change-item-header">
                  <span className="change-item-dot" style={{ background: statusColor }}></span>
                  <span className="change-item-name">{c}</span>
                </div>
                <div className="change-item-meta">
                  <span className="change-item-status" style={{ color: statusColor }}>
                    {statusLabel}
                  </span>
                  <span className="change-item-progress">{progress}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="sidebar-actions">
          <button
            id="show-create-change-btn"
            onClick={() => setShowCreateChange(true)}
            className="new-change-btn"
          >
            + New Change
          </button>
        </div>
        <div className="pane-resizer sidebar-resizer" onMouseDown={handleSidebarMouseDown} />
      </aside>

      {/* ===== MAIN COLUMN ===== */}
      <main className="main-column">
        {/* Header */}
        <header className="app-header">
          <div className="header-left">
            <div className="header-title-group">
              <div className="header-title">{selectedChange || 'No Change Selected'}</div>
              <div className="header-subtitle">
                {selectedChangeMetadata?.schema || 'spec-driven'} · created{' '}
                {selectedChangeMetadata?.created || 'Just now'}
              </div>
            </div>
            {selectedChangeMetadata?.worktreeBranch && (
              <span className="worktree-badge">
                <span className="worktree-badge-icon">⎇</span>
                <span className="worktree-badge-text">worktrees/{selectedChangeMetadata.worktreeBranch}</span>
              </span>
            )}
          </div>

          <div className="header-right">
            <div className="tool-cluster">
              <button
                onClick={() => setActiveTool(activeTool === 'grill' ? null : 'grill')}
                className={`tool-cluster-btn ${activeTool === 'grill' ? 'active' : ''}`}
                title="Grill Me — pressure-test"
              >
                <span>⚡</span>Grill Me
              </button>
              <button
                onClick={() => setActiveTool(activeTool === 'audit' ? null : 'audit')}
                className={`tool-cluster-btn ${activeTool === 'audit' ? 'active' : ''}`}
                title="Traceability audit"
              >
                <span>🔍</span>Audit
              </button>
              <button
                id="ask-ai-btn"
                onClick={() => setActiveTool(activeTool === 'chat' ? null : 'chat')}
                className={`tool-cluster-btn ${activeTool === 'chat' ? 'active' : ''}`}
                title="Ask the AI assistant"
              >
                <span>💬</span>Ask AI
              </button>
            </div>

            <div className="header-divider"></div>
            <span className="kbd-pill">⌘K</span>

            <div className="plumbing-menu-container">
              <button
                onClick={() => setRepoMenuOpen(!repoMenuOpen)}
                className="plumbing-trigger"
                title="Repo & setup"
              >
                ⋯
              </button>
              {repoMenuOpen && (
                <div className="plumbing-menu">
                  <div className="plumbing-section-title">Setup · run once</div>
                  {!status.isOpenSpec ? (
                    <div
                      id="init-openspec-btn"
                      onClick={() => {
                        setRepoMenuOpen(false);
                        handleInitOpenSpec();
                      }}
                      className="plumbing-item"
                    >
                      <span>⚙</span>Initialize OpenSpec
                    </div>
                  ) : (
                    <div style={{ opacity: 0.5, cursor: 'not-allowed' }} className="plumbing-item">
                      <span>⚙</span>OpenSpec Active
                    </div>
                  )}
                  <div
                    onClick={() => {
                      setRepoMenuOpen(false);
                      setShowWorktreeModal(true);
                    }}
                    className="plumbing-item"
                  >
                    <span>⎇</span>Create Worktree…
                  </div>
                  <div className="plumbing-divider"></div>
                  <div
                    onClick={() => {
                      setRepoMenuOpen(false);
                      setStatus(null);
                    }}
                    className="plumbing-item"
                  >
                    <span>⇄</span>Switch Repository
                  </div>
                  <div className="plumbing-divider"></div>
                  <div className="plumbing-section-title">Appearance</div>
                  <div className="segmented-control">
                    <button
                      onClick={() => setTheme('Soft')}
                      className={`segment-btn ${theme === 'Soft' ? 'active' : ''}`}
                    >
                      Soft
                    </button>
                    <button
                      onClick={() => setTheme('Mono')}
                      className={`segment-btn ${theme === 'Mono' ? 'active' : ''}`}
                    >
                      Mono
                    </button>
                    <button
                      onClick={() => setTheme('Vivid')}
                      className={`segment-btn ${theme === 'Vivid' ? 'active' : ''}`}
                    >
                      Vivid
                    </button>
                  </div>
                  <div
                    onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
                    className="plumbing-item"
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{mode === 'light' ? '☾' : '☀'}</span>
                      {mode === 'light' ? 'Light mode' : 'Dark mode'}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--faint)' }}>
                      {mode === 'light' ? '→ dark' : '→ light'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {changeCreateSuccess && (
          <div id="change-create-success" className="propose-status-banner success" style={{ margin: '12px 26px 0 26px' }}>
            {changeCreateSuccess}
          </div>
        )}

        {worktreeSuccess && (
          <div className="propose-status-banner success message-success" style={{ margin: '12px 26px 0 26px' }}>
            {worktreeSuccess}
          </div>
        )}

        {/* Concept Strip */}
        {showHint && (
          <div className="concept-hint-strip">
            <span>Concept</span>
            <span>
              The <strong>stage tabs</strong> are the spine. The <strong>tools</strong> (top-right) can be summoned
              over any stage — open one, then switch stages and watch it re-scope.
            </span>
            <button onClick={() => setShowHint(false)} className="concept-hint-close">
              ×
            </button>
          </div>
        )}

        {/* STAGE SPINE */}
        <div className="stage-spine">
          <button
            onClick={() => setActiveStage('propose')}
            className={`stage-tab ${activeStage === 'propose' ? 'active' : ''}`}
          >
            <span className="stage-tab-dot">1</span>Propose
          </button>
          <button
            id="review-mode-tab"
            onClick={() => setActiveStage('review')}
            className={`stage-tab ${activeStage === 'review' ? 'active' : ''}`}
          >
            <span className="stage-tab-dot">2</span>Review
          </button>
        </div>

        {/* BODY (Content + Tool Dock) */}
        <div className="body-container">
          <div className="stage-content">
            {/* PROPOSE STAGE */}
            {activeStage === 'propose' && (
              <div className="propose-canvas">
                <h2>Propose</h2>
                <div className="propose-desc">
                  Generate the spec, design &amp; task pipeline with your engine. Output streams here, then populates the Review DAG.
                </div>

                <div className="propose-label">Engine</div>
                <div className="engine-dropdown-wrapper">
                  <select
                    id="propose-engine-select"
                    value={selectedChangeMetadata?.proposeEngine || 'gemini'}
                    onChange={(e) => handleUpdateEngine(e.target.value)}
                    className="engine-dropdown-select"
                  >
                    <option value="gemini">Gemini (AGY)</option>
                    <option value="claude">Claude Code</option>
                    <option value="cursor">Cursor</option>
                    <option value="codex">Codex</option>
                  </select>
                  <span className="engine-dropdown-caret">▾</span>
                </div>

                <div className="propose-label">Command</div>
                <div className="command-box">
                  <span className="command-prompt">$</span>
                  <code className="command-code">
                    npx openspec propose {selectedChange || 'change-name'} --engine{' '}
                    {selectedChangeMetadata?.proposeEngine || 'gemini'}
                  </code>
                </div>

                <button
                  onClick={handleRunPropose}
                  disabled={proposeLoading || !selectedChange}
                  className="run-propose-btn"
                >
                  {proposeLoading ? 'Generating...' : 'Run Propose'}
                </button>

                {proposeSuccess && <div className="propose-status-banner success">✓ {proposeSuccess}</div>}
                {proposeError && <div className="propose-status-banner error">⚠ {proposeError}</div>}

                <div className="propose-hint-card">
                  Stuck on a decision before you generate?{' '}
                  <strong id="show-brainstorm-btn" onClick={() => setShowBrainstorm(true)}>
                    ⚡ Grill Me
                  </strong>{' '}
                  here to pressure-test the raw <em>concept</em>.
                </div>
              </div>
            )}

            {/* REVIEW STAGE */}
            {activeStage === 'review' && (
              <div className="review-canvas">
                <div className="views-bar">
                  <span className="views-label">Views</span>
                  <button
                    onClick={() => setDagOn(!dagOn)}
                    className={`views-chip ${dagOn ? 'active' : ''}`}
                    title="Toggle the DAG view"
                  >
                    <span className="views-check-box">{dagOn ? '✓' : ''}</span>
                    DAG
                  </button>
                  <button
                    onClick={() => setShowCritical(!showCritical)}
                    className={`views-chip ${showCritical ? 'active' : ''}`}
                    title="Show critical paths (ancestors of pending tasks)"
                  >
                    <span className="views-check-box">{showCritical ? '✓' : ''}</span>
                    Critical Paths
                  </button>
                  <span className="views-chip disabled">
                    Diff <span className="soon-tag">soon</span>
                  </span>
                  <span className="views-chip disabled">
                    Coverage <span className="soon-tag">soon</span>
                  </span>

                  <input
                    type="text"
                    placeholder="Filter nodes..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="views-filter-input"
                  />

                  <div style={{ flex: 1 }}></div>

                  <span className="meta-info-chip">
                    Schema <strong>{selectedChangeMetadata?.schema || 'spec-driven'}</strong>
                  </span>
                  <span className="meta-info-chip">
                    {completedTasksCount} / {totalTasksCount} tasks complete
                  </span>
                </div>

                {dagLoading && <div className="loading" style={{ textAlign: 'center', padding: '2rem' }}>Building Linkage DAG...</div>}

                {!dagLoading && dagData && (
                  <DagViewer
                    dag={dagData}
                    dagOn={dagOn}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={setSelectedNodeId}
                    onToggleTask={handleToggleTaskLocal}
                    showCritical={showCritical}
                    filterText={filterText}
                  />
                )}
              </div>
            )}
          </div>

          {/* ===== TOOL DOCK ===== */}
          {activeTool && (
            <aside className="tool-dock" style={{ width: `${toolDockWidth}px` }}>
              <div className="pane-resizer tool-dock-resizer" onMouseDown={handleToolDockMouseDown} />
              <div className="tool-dock-header">
                <div className="tool-dock-title-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                    <span className="tool-dock-icon-wrapper">
                      {activeTool === 'grill' ? '⚡' : activeTool === 'audit' ? '🔍' : '💬'}
                    </span>
                    <span className="tool-dock-title">
                      {activeTool === 'grill'
                        ? 'Grill Me'
                        : activeTool === 'audit'
                        ? 'Traceability Audit'
                        : 'Ask AI'}
                    </span>
                  </span>
                  <button onClick={() => setActiveTool(null)} className="tool-dock-close-btn">
                    ×
                  </button>
                </div>
                {/* Context chip */}
                <div className="tool-dock-context-chip">
                  <span className="tool-dock-context-dot"></span>
                  {activeTool === 'grill' ? 'pressure-testing' : activeTool === 'audit' ? 'auditing' : 'context'} ·{' '}
                  {selectedChange} · {activeStage === 'propose' ? 'Propose' : 'Review'}
                </div>
              </div>

              <div className="tool-dock-body">
                {/* Settings Accordion for LLMs */}
                {activeTool !== 'audit' && (
                  <>
                    <button
                      onClick={() => setShowToolSettings(!showToolSettings)}
                      className="tool-dock-settings-btn settings-toggle-btn"
                    >
                      {showToolSettings ? '⚙️ Hide AI Options' : '⚙️ Configure AI Options'}
                    </button>
                    {showToolSettings && (
                      <div className="tool-dock-settings-panel">
                        <div>
                          <label htmlFor="chat-provider-select">Provider</label>
                          <select
                            id="chat-provider-select"
                            value={provider}
                            onChange={(e) => {
                              const newProvider = e.target.value as any;
                              setProvider(newProvider);
                              if (newProvider === 'gemini') {
                                setModel('gemini-3.5-flash');
                              } else if (newProvider === 'ollama') {
                                setModel('qwen3-coder-next');
                              } else {
                                setModel('gpt-4o');
                              }
                            }}
                          >
                            <option value="gemini">Gemini</option>
                            <option value="ollama">Ollama</option>
                            <option value="custom">Custom Endpoint</option>
                          </select>
                        </div>
                        {provider === 'ollama' && (
                          <div>
                            <label htmlFor="chat-model-select">Model Name</label>
                            <select
                              id="chat-model-select"
                              value={OLLAMA_MODELS.some(m => m.value === model) ? model : 'custom'}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'custom') {
                                  setModel('');
                                } else {
                                  setModel(val);
                                }
                              }}
                            >
                              {OLLAMA_MODELS.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                              <option value="custom">Custom Model Name...</option>
                            </select>
                          </div>
                        )}
                        {provider === 'gemini' && (
                          <div>
                            <label htmlFor="chat-model-select">Model Name</label>
                            <select
                              id="chat-model-select"
                              value={GEMINI_MODELS.some(m => m.value === model) ? model : 'custom'}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'custom') {
                                  setModel('');
                                } else {
                                  setModel(val);
                                }
                              }}
                            >
                              {GEMINI_MODELS.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                              <option value="custom">Custom Model Name...</option>
                            </select>
                          </div>
                        )}
                        {(provider === 'custom' || 
                          (provider === 'ollama' && !OLLAMA_MODELS.some(m => m.value === model)) ||
                          (provider === 'gemini' && !GEMINI_MODELS.some(m => m.value === model))) && (
                          <div>
                            <label htmlFor="chat-model-input">Custom Model Name</label>
                            <input
                              id="chat-model-input"
                              type="text"
                              value={model}
                              onChange={(e) => setModel(e.target.value)}
                              placeholder="e.g. gemma2 or custom-model"
                            />
                          </div>
                        )}
                        {provider === 'custom' && (
                          <>
                            <div>
                              <label htmlFor="chat-endpoint-input">Endpoint URL</label>
                              <input
                                id="chat-endpoint-input"
                                type="text"
                                value={customEndpoint}
                                onChange={(e) => setCustomEndpoint(e.target.value)}
                              />
                            </div>
                            <div>
                              <label htmlFor="chat-key-input">API Key</label>
                              <input
                                id="chat-key-input"
                                type="password"
                                value={customApiKey}
                                onChange={(e) => setCustomApiKey(e.target.value)}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Audit view */}
                {activeTool === 'audit' && (
                  <>
                    {auditLoading && <div className="loading">Running audit checks...</div>}
                    {!auditLoading && activeStage === 'propose' && (
                      <div className="audit-empty-card">
                        <div className="audit-empty-icon">🔍</div>
                        <div className="audit-empty-text">
                          No DAG to audit yet. The graph is generated in <strong>Propose</strong> — run it, then I can
                          trace specs → design → tasks.
                        </div>
                      </div>
                    )}
                    {!auditLoading && activeStage === 'review' && (
                      <div className="audit-checklist">
                        {auditResults.map((res, idx) => (
                          <div key={idx} className={`audit-check-item ${res.ok ? 'ok' : 'warn'}`}>
                            <span className="audit-check-icon-wrapper">{res.ok ? '✓' : '!'}</span>
                            <span className="audit-check-text">{res.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Chat interfaces */}
                {activeTool !== 'audit' && (
                  <div className="chat-bubble-thread">
                    {/* Pre-canned Prompt Shortcuts */}
                    {activeTool === 'chat' && activeStage === 'review' && (
                      <div className="tool-dock-shortcuts">
                        <button
                          onClick={() => {
                            setToolInput('Audit Traceability');
                          }}
                          className="tool-dock-shortcut-btn"
                        >
                          🔍 Audit Traceability
                        </button>
                        <button
                          onClick={() => {
                            setToolInput('List Incomplete Tasks');
                          }}
                          className="tool-dock-shortcut-btn"
                        >
                          📋 List Incomplete Tasks
                        </button>
                        <button
                          onClick={() => {
                            setToolInput('Summarize Decisions');
                          }}
                          className="tool-dock-shortcut-btn"
                        >
                          💡 Summarize Decisions
                        </button>
                      </div>
                    )}

                    {toolMessages.map((m, idx) => (
                      <div key={idx} className={`chat-bubble ${m.role}`}>
                        {renderMarkdown(m.content)}
                      </div>
                    ))}
                    {toolLoading && (
                      <div className="chat-bubble assistant loading">
                        <span className="spinner"></span> stress-testing...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              {/* Composer */}
              {activeTool !== 'audit' && (
                <form onSubmit={handleToolSend} className="tool-dock-composer">
                  <input
                    type="text"
                    placeholder="Ask about this stage..."
                    value={toolInput}
                    onChange={(e) => setToolInput(e.target.value)}
                    className="tool-dock-input"
                    disabled={toolLoading}
                  />
                  <button type="submit" className="tool-dock-send-btn" disabled={toolLoading || !toolInput.trim()}>
                    Send
                  </button>
                </form>
              )}
            </aside>
          )}
        </div>
      </main>

      {/* ===== NEW CHANGE MODAL ===== */}
      {showCreateChange && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Create New Change</h2>
              <button onClick={() => setShowCreateChange(false)} className="modal-close-btn">
                ×
              </button>
            </div>
            <CreateChangeForm
              repoPath={path}
              onCreateSuccess={(changeName) => {
                setShowCreateChange(false);
                setChangeCreateSuccess(`Change "${changeName}" created successfully.`);
                fetchChanges();
                setSelectedChange(changeName);
                setTimeout(() => setChangeCreateSuccess(null), 5000);
              }}
              onCancel={() => setShowCreateChange(false)}
            />
          </div>
        </div>
      )}

      {/* ===== BRAINSTORM/GRILL MODAL ===== */}
      {showBrainstorm && (
        <BrainstormWizard
          repoPath={path}
          onCommitSuccess={(changeName) => {
            setShowBrainstorm(false);
            setChangeCreateSuccess(`Change "${changeName}" created successfully.`);
            fetchChanges();
            setSelectedChange(changeName);
            setTimeout(() => setChangeCreateSuccess(null), 5000);
          }}
          onCancel={() => setShowBrainstorm(false)}
        />
      )}

      {/* ===== GIT WORKTREE MODAL ===== */}
      {showWorktreeModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h2>Create Git Worktree</h2>
              <button onClick={() => setShowWorktreeModal(false)} className="modal-close-btn">
                ×
              </button>
            </div>
            <form onSubmit={handleCreateWorktree} className="modal-form">
              <div className="form-group">
                <label htmlFor="branch-name-input">Branch Name:</label>
                <input
                  id="branch-name-input"
                  type="text"
                  placeholder="e.g., feature/login-flow"
                  value={worktreeBranchName}
                  onChange={(e) => setWorktreeBranchName(e.target.value)}
                  disabled={worktreeCreating}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="worktree-path-input">Worktree Destination Path:</label>
                <input
                  id="worktree-path-input"
                  type="text"
                  placeholder="Destination path..."
                  value={worktreeDestPath}
                  onChange={(e) => setWorktreeDestPath(e.target.value)}
                  disabled={worktreeCreating}
                  required
                />
              </div>

              {worktreeModalErr && <div className="error-banner">⚠ {worktreeModalErr}</div>}

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  id="create-worktree-btn"
                  type="submit"
                  disabled={worktreeCreating || !worktreeBranchName.trim() || !worktreeDestPath.trim()}
                  className="btn btn-primary"
                >
                  {worktreeCreating ? 'Creating...' : 'Create Worktree'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWorktreeModal(false)}
                  className="btn btn-secondary"
                  disabled={worktreeCreating}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== WORKTREE UPDATE MODAL ===== */}
      {showWorktreeUpdateModal && status?.worktrees && (
        <div className="modal-overlay">
          <div className="modal-card worktree-update-modal" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Update Connected Worktrees</h2>
              <button 
                onClick={() => setShowWorktreeUpdateModal(false)} 
                className="modal-close-btn"
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 20px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--dim)', lineHeight: '1.5' }}>
                This repository has other connected Git worktrees. Would you like to update the OpenSpec configurations and trace templates for all of them?
              </p>

              {!customSelectionActive ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                  <button
                    onClick={() => {
                      executeInit(status.worktrees!.map(w => w.path));
                      setShowWorktreeUpdateModal(false);
                    }}
                    className="btn btn-primary"
                    id="wt-update-all-btn"
                    style={{ justifyContent: 'center', padding: '10px' }}
                  >
                    Yes, Update All ({status.worktrees.length})
                  </button>
                  <button
                    onClick={() => {
                      executeInit([path]);
                      setShowWorktreeUpdateModal(false);
                    }}
                    className="btn btn-secondary"
                    id="wt-update-only-this-btn"
                    style={{ justifyContent: 'center', padding: '10px' }}
                  >
                    No, Only This One
                  </button>
                  <button
                    onClick={() => {
                      setCustomSelectionActive(true);
                      setWorktreePathsToUpdate([path]);
                    }}
                    className="btn btn-secondary"
                    id="wt-update-custom-btn"
                    style={{ justifyContent: 'center', padding: '10px' }}
                  >
                    Custom Selection...
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="worktree-checkbox-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto', padding: '10px', background: 'var(--s2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    {status.worktrees.map((wt) => {
                      const isSelected = worktreePathsToUpdate.includes(wt.path);
                      return (
                        <label 
                          key={wt.path} 
                          className="worktree-checkbox-item"
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', userSelect: 'none', padding: '4px 0' }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={wt.path === path}
                            onChange={() => {
                              if (wt.path === path) return;
                              if (isSelected) {
                                setWorktreePathsToUpdate(worktreePathsToUpdate.filter(p => p !== wt.path));
                              } else {
                                setWorktreePathsToUpdate([...worktreePathsToUpdate, wt.path]);
                              }
                            }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                            <span style={{ fontWeight: 600, color: 'var(--text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={wt.path}>
                              {wt.path} {wt.isMain && <span style={{ fontSize: '10px', padding: '1px 4px', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: '4px', marginLeft: '4px' }}>Main</span>}
                            </span>
                            {wt.branch && (
                              <span style={{ fontSize: '11px', color: 'var(--dim)' }}>
                                branch: {wt.branch}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => {
                        executeInit(worktreePathsToUpdate);
                        setShowWorktreeUpdateModal(false);
                      }}
                      className="btn btn-primary"
                      id="wt-update-submit-btn"
                      disabled={worktreePathsToUpdate.length === 0}
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Update Selected ({worktreePathsToUpdate.length})
                    </button>
                    <button
                      onClick={() => setCustomSelectionActive(false)}
                      className="btn btn-secondary"
                      style={{ flex: 1, justifyContent: 'center' }}
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
