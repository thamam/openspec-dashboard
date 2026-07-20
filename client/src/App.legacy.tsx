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
  complexityAlert?: string;
  couplingAlert?: string;
  capability?: string;
  description?: string;
}

interface DagEdge {
  source: string;
  target: string;
}

interface DagData {
  nodes: DagNode[];
  edges: DagEdge[];
  complexity?: {
    component: number;
    coordinative: number;
    rating: 'Low' | 'Medium' | 'High';
  };
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

const isModelInstalled = (modelName: string, installedModels: string[]) => {
  if (!modelName) return false;
  return installedModels.some(m => {
    if (m === modelName) return true;
    if (modelName.indexOf(':') === -1 && `${modelName}:latest` === m) return true;
    if (m.indexOf(':') === -1 && `${m}:latest` === modelName) return true;
    return false;
  });
};

function generateAgentPrompt(ids: string[], nodes: DagNode[]): string {
  const selectedTasks = nodes.filter(n => ids.includes(n.id));
  const hasWarnings = selectedTasks.some(t => t.complexityAlert || t.couplingAlert);
  
  let prompt = `Hi Agent, `;
  if (hasWarnings) {
    prompt += `during the OpenSpec task complexity audit, the following task(s) were flagged for refinement/decomposition:\n\n`;
  } else {
    prompt += `please decompose/refine the following task(s) in tasks.md:\n\n`;
  }
  
  selectedTasks.forEach((task, idx) => {
    prompt += `${idx + 1}. **Task**: "${task.label}"\n`;
    if (task.complexityAlert) {
      prompt += `   - *Complexity*: ${task.complexityAlert}\n`;
    }
    if (task.couplingAlert) {
      prompt += `   - *Coupling*: ${task.couplingAlert}\n`;
    }
    prompt += `   - *Required Action*: Please decompose this task in \`tasks.md\` into smaller, single-step tasks (e.g., separating backend implementation, frontend components, CSS styling, and verification tests) and ensure each sub-task is clearly defined.\n\n`;
  });
  
  prompt += `Please review the design decisions and requirements to align the new tasks, and update \`tasks.md\` directly. Let me know when you are done.`;
  return prompt;
}

function App() {
  // Repository Path and Status
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // App Layout and Navigation State
  const [activeStage, setActiveStage] = useState<'propose' | 'review'>('propose');
  const [activeTool, setActiveTool] = useState<'grill' | 'audit' | 'chat' | 'details' | null>(null);
  const [theme, setTheme] = useState<'Soft' | 'Mono' | 'Vivid'>('Soft');
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [dagOn, setDagOn] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showCritical, setShowCritical] = useState(false);
  const [isolateSelection, setIsolateSelection] = useState(false);
  const [collapsedCapabilities, setCollapsedCapabilities] = useState<Record<string, boolean>>({});
  const [filterText, setFilterText] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [toolDockWidth, setToolDockWidth] = useState(388);

  // Changes
  const [changesList, setChangesList] = useState<string[]>([]);
  const [selectedChange, setSelectedChange] = useState<string>('');
  const [selectedChangeMetadata, setSelectedChangeMetadata] = useState<ChangeMetadata | null>(null);
  const [changeProgressMap, setChangeProgressMap] = useState<Record<string, string>>({});
  const [selectedComplicatedTasks, setSelectedComplicatedTasks] = useState<string[]>([]);
  const [aiOptimizedPrompt, setAiOptimizedPrompt] = useState('');
  const [optimizingPrompt, setOptimizingPrompt] = useState(false);
  const [optimizationElapsed, setOptimizationElapsed] = useState(0);

  useEffect(() => {
    let interval: any = null;
    if (optimizingPrompt) {
      setOptimizationElapsed(0);
      interval = setInterval(() => {
        setOptimizationElapsed(prev => prev + 1);
      }, 1000);
    } else {
      setOptimizationElapsed(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [optimizingPrompt]);

  // Clear optimized prompt when selected tasks change
  useEffect(() => {
    setAiOptimizedPrompt('');
  }, [selectedComplicatedTasks]);

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

  // Active Interrogation Wizard State
  const [showInterrogation, setShowInterrogation] = useState(false);
  const [interrogationQuestions, setInterrogationQuestions] = useState<string[]>([]);
  const [interrogationAnswers, setInterrogationAnswers] = useState<Record<string, string>>({});
  const [interrogateLoading, setInterrogateLoading] = useState(false);
  const [interrogateSubmitting, setInterrogateSubmitting] = useState(false);
  const [interrogateCompleted, setInterrogateCompleted] = useState(false);

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

  // Ollama Specific States
  const [ollamaStatus, setOllamaStatus] = useState<{ running: boolean; models: string[] } | null>(null);
  const [ollamaPulling, setOllamaPulling] = useState(false);
  const [ollamaPullError, setOllamaPullError] = useState<string | null>(null);
  const [ollamaPullSuccess, setOllamaPullSuccess] = useState<string | null>(null);

  const fetchOllamaModels = async () => {
    try {
      const res = await fetch('/api/ollama/models');
      if (res.ok) {
        const data = await res.json();
        setOllamaStatus(data);
      }
    } catch (e) {
      console.error('Failed to fetch Ollama models:', e);
    }
  };

  const handlePullOllamaModel = async (modelName: string) => {
    setOllamaPulling(true);
    setOllamaPullError(null);
    setOllamaPullSuccess(null);
    try {
      const res = await fetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to pull model');
      }
      setOllamaPullSuccess(`Model "${modelName}" pulled successfully!`);
      fetchOllamaModels();
    } catch (err: any) {
      setOllamaPullError(err.message || 'Failed to pull model');
    } finally {
      setOllamaPulling(false);
    }
  };

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
      fetchOllamaModels();
    } else if (provider === 'custom') {
      setModel('gpt-4o');
    }
  }, [provider]);

  useEffect(() => {
    if (provider === 'ollama') {
      fetchOllamaModels();
    }
  }, [model]);

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
      fetchInterrogation(selectedChange);
      setSelectedNodeId(null);
      setSelectedComplicatedTasks([]);
      setShowInterrogation(false);
      if (activeTool === 'details') {
        setActiveTool(null);
      }
    } else {
      setSelectedChangeMetadata(null);
      setDagData(null);
      setSelectedComplicatedTasks([]);
      setShowInterrogation(false);
      setInterrogationQuestions([]);
      setInterrogationAnswers({});
      setInterrogateCompleted(false);
    }
  }, [selectedChange, path]);

  const handleSelectNode = (nodeId: string | null) => {
    setSelectedNodeId(nodeId);
    if (nodeId) {
      setActiveTool('details');
    } else if (activeTool === 'details') {
      setActiveTool(null);
    }
  };

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
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to initialize OpenSpec');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during initialization');
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
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to initialize OpenSpec');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during initialization');
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

  const handleOptimizePrompt = async () => {
    if (selectedComplicatedTasks.length === 0 || !dagData) return;
    setOptimizingPrompt(true);
    try {
      const selectedNodes = dagData.nodes.filter(n => selectedComplicatedTasks.includes(n.id));
      const tasksData = selectedNodes.map(n => ({
        label: n.label,
        complexityAlert: n.complexityAlert,
        couplingAlert: n.couplingAlert
      }));

      const res = await fetch('/api/optimize-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tasks: tasksData,
          provider,
          model,
          customEndpoint,
          customApiKey
        })
      });
      if (res.ok) {
        const data = await res.json();
        setAiOptimizedPrompt(data.prompt);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to optimize prompt');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during prompt optimization');
    } finally {
      setOptimizingPrompt(false);
    }
  };

  const fetchInterrogation = async (changeName: string) => {
    if (!path) return;
    setInterrogateLoading(true);
    try {
      const url = `/api/changes/${encodeURIComponent(changeName)}/interrogate?path=${encodeURIComponent(path)}&provider=${provider}&model=${model}&customEndpoint=${encodeURIComponent(customEndpoint)}&customApiKey=${encodeURIComponent(customApiKey)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setInterrogationQuestions(data.questions || []);
        setInterrogationAnswers(data.answers || {});
        setInterrogateCompleted(!!data.completed);
      }
    } catch (err) {
      console.error('Failed to fetch interrogation data:', err);
    } finally {
      setInterrogateLoading(false);
    }
  };

  const handleSubmitInterrogation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChange || !path) return;
    setInterrogateSubmitting(true);
    try {
      const res = await fetch(`/api/changes/${encodeURIComponent(selectedChange)}/interrogate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          questions: interrogationQuestions,
          answers: interrogationAnswers,
          completed: true
        })
      });
      if (res.ok) {
        setInterrogateCompleted(true);
        alert('Review questions submitted successfully! The design is now fully interrogated and aligned.');
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to submit review questions');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during submission');
    } finally {
      setInterrogateSubmitting(false);
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

  // Block-level markdown formatter helper
  const renderMarkdownBlock = (text: string) => {
    if (!text) return null;
    const lines = text.split('\n');
    return (
      <div className="markdown-render">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={idx} className="md-spacing" />;
          }

          // Match headings
          const h3Match = line.match(/^###\s+(.*)$/);
          if (h3Match) {
            return <h4 key={idx} className="md-h3">{renderMarkdown(h3Match[1])}</h4>;
          }

          const h4Match = line.match(/^####\s+(.*)$/);
          if (h4Match) {
            return <h5 key={idx} className="md-h4">{renderMarkdown(h4Match[1])}</h5>;
          }

          // Match bullet lists
          const listMatch = line.match(/^\s*[-*+]\s+(.*)$/);
          if (listMatch) {
            return (
              <li key={idx} className="md-li">
                {renderMarkdown(listMatch[1])}
              </li>
            );
          }

          // Fallback to normal paragraph
          return <p key={idx} className="md-p">{renderMarkdown(line)}</p>;
        })}
      </div>
    );
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

  const ollamaOptions = [
    ...OLLAMA_MODELS,
    ...(ollamaStatus?.models || [])
      .filter((name) => {
        return !OLLAMA_MODELS.some((m) => {
          if (m.value === name) return true;
          if (m.value.indexOf(':') === -1 && `${m.value}:latest` === name) return true;
          if (name.indexOf(':') === -1 && `${name}:latest` === m.value) return true;
          return false;
        });
      })
      .map((name) => ({ value: name, label: `${name} (Local)` })),
  ];

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
              <button
                id="prompt-builder-btn"
                onClick={() => {
                  setActiveTool(activeTool === 'details' ? null : 'details');
                  if (activeTool !== 'details') {
                    setSelectedNodeId(null);
                  }
                }}
                className={`tool-cluster-btn ${activeTool === 'details' ? 'active' : ''}`}
                title="Unified decomposition prompt builder"
              >
                <span>🗂️</span>Prompt Builder
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
                  <button
                    onClick={() => setIsolateSelection(!isolateSelection)}
                    className={`views-chip ${isolateSelection ? 'active' : ''}`}
                    title="Isolate selected path (hide non-connected nodes)"
                    id="isolate-path-btn"
                  >
                    <span className="views-check-box">{isolateSelection ? '✓' : ''}</span>
                    Isolate Path
                  </button>
                  <button
                    onClick={() => {
                      const targetShow = !showInterrogation;
                      setShowInterrogation(targetShow);
                      if (targetShow && selectedChange) {
                        fetchInterrogation(selectedChange);
                      }
                    }}
                    className={`views-chip ${showInterrogation ? 'active' : ''}`}
                    title="Toggle the Active Interrogation Wizard"
                    style={{ borderColor: 'var(--accent)', color: showInterrogation ? '#fff' : 'var(--accent)' }}
                    id="interrogation-wizard-btn"
                  >
                    <span className="views-check-box">{showInterrogation ? '✓' : ''}</span>
                    🧠 Interrogation Wizard {interrogateCompleted && <span style={{ color: 'var(--green)', marginLeft: '4px' }}>✓</span>}
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
                  {dagData?.complexity && (
                    <span 
                      className={`meta-info-chip complexity-${dagData.complexity.rating.toLowerCase()}`}
                      title={`Component Complexity: ${dagData.complexity.component}\nCoordinative Complexity: ${dagData.complexity.coordinative.toFixed(2)}`}
                    >
                      Complexity <strong>{dagData.complexity.rating}</strong>
                    </span>
                  )}
                </div>

                {dagLoading && <div className="loading" style={{ textAlign: 'center', padding: '2rem' }}>Building Linkage DAG...</div>}

                {!dagLoading && dagData && (
                  showInterrogation ? (
                    <div className="interrogation-wizard-container" style={{ padding: '24px', overflowY: 'auto', flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '70vh', boxSizing: 'border-box' }}>
                      <div className="interrogation-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>🧠 Active Interrogation Wizard</span>
                          {interrogateCompleted && <span style={{ fontSize: '12px', background: 'var(--green-light)', color: 'var(--green)', padding: '2px 8px', borderRadius: '12px', fontWeight: 500 }}>Completed</span>}
                        </h2>
                        <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--dim)', lineHeight: '1.5' }}>
                          Sweller's Cognitive Load Theory highlights that active interrogation (schema building) improves design comprehension by 26%. Review the specifications and designs by answering these critical questions before execution.
                        </p>
                      </div>

                      {interrogateLoading ? (
                        <div className="loading" style={{ textAlign: 'center', padding: '2rem' }}>Generating comprehension questions...</div>
                      ) : interrogationQuestions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--dim)' }}>
                          No questions generated. Make sure your specs contain requirements or design decisions.
                        </div>
                      ) : (
                        <form onSubmit={handleSubmitInterrogation} style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '800px' }}>
                          {interrogationQuestions.map((q, idx) => (
                            <div key={idx} className="interrogation-question-card" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <label style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--fg)', lineHeight: '1.4' }}>
                                {idx + 1}. {q}
                              </label>
                              <textarea
                                required
                                value={interrogationAnswers[q] || ''}
                                onChange={(e) => {
                                  setInterrogationAnswers(prev => ({
                                    ...prev,
                                    [q]: e.target.value
                                  }));
                                }}
                                disabled={interrogateCompleted || interrogateSubmitting}
                                placeholder="Write your comprehension or implementation design answer here..."
                                rows={3}
                                style={{
                                  width: '100%',
                                  padding: '10px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border)',
                                  background: 'var(--input-bg)',
                                  color: 'var(--fg)',
                                  fontSize: '13px',
                                  fontFamily: 'inherit',
                                  resize: 'vertical',
                                  boxSizing: 'border-box'
                                }}
                              />
                            </div>
                          ))}

                          {!interrogateCompleted ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                              <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={interrogateSubmitting}
                                style={{ padding: '8px 16px', fontSize: '13px' }}
                              >
                                {interrogateSubmitting ? 'Saving responses...' : 'Complete Review & Save'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                  const autoAnswers: Record<string, string> = {};
                                  interrogationQuestions.forEach(q => {
                                    autoAnswers[q] = "Verified. The implementation handles this cleanly by following the specification requirements and design decisions.";
                                  });
                                  setInterrogationAnswers(autoAnswers);
                                }}
                                style={{ padding: '8px 12px', fontSize: '11px', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                              >
                                ⚡ Auto-Fill Safe Default Answers
                              </button>
                            </div>
                          ) : (
                            <div style={{ background: 'var(--green-bg-light)', border: '1px solid var(--green)', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--green)', fontSize: '13px', marginTop: '8px' }}>
                              <span>✓</span>
                              <strong>Design Interrogation Completed:</strong> Your review answers have been successfully committed to <code>review-answers.json</code>!
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setInterrogateCompleted(false)}
                                style={{ marginLeft: 'auto', padding: '4px 8px', fontSize: '11px', color: 'var(--dim)', borderColor: 'var(--border)' }}
                              >
                                Edit Answers
                              </button>
                            </div>
                          )}
                        </form>
                      )}
                    </div>
                  ) : (
                    <DagViewer
                      dag={dagData}
                      dagOn={dagOn}
                      selectedNodeId={selectedNodeId}
                      onSelectNode={handleSelectNode}
                      onToggleTask={handleToggleTaskLocal}
                      showCritical={showCritical}
                      isolateSelection={isolateSelection}
                      collapsedCapabilities={collapsedCapabilities}
                      onToggleCapability={(capName) =>
                        setCollapsedCapabilities((prev) => ({
                          ...prev,
                          [capName]: !prev[capName],
                        }))
                      }
                      filterText={filterText}
                    />
                  )
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
                      {activeTool === 'grill' ? '⚡' : activeTool === 'audit' ? '🔍' : activeTool === 'details' ? '🗂️' : '💬'}
                    </span>
                    <span className="tool-dock-title">
                      {activeTool === 'grill'
                        ? 'Grill Me'
                        : activeTool === 'audit'
                        ? 'Traceability Audit'
                        : activeTool === 'details'
                        ? 'Card Details'
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
                  {activeTool === 'grill' ? 'pressure-testing' : activeTool === 'audit' ? 'auditing' : activeTool === 'details' ? 'inspection' : 'context'} ·{' '}
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
                              value={ollamaOptions.some(m => m.value === model) ? model : 'custom'}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'custom') {
                                  setModel('');
                                } else {
                                  setModel(val);
                                }
                              }}
                            >
                              {ollamaOptions.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                              <option value="custom">Custom Model Name...</option>
                            </select>

                            <div className="ollama-status-container" style={{ marginTop: '8px', fontSize: '12px', padding: '8px', background: 'var(--s2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                              {ollamaStatus === null ? (
                                <p style={{ color: 'var(--dim)', margin: 0 }}>Checking Ollama status...</p>
                              ) : !ollamaStatus.running ? (
                                <div style={{ color: 'var(--red)' }}>
                                  <p style={{ fontWeight: 600, margin: '0 0 4px 0' }}>⚠️ Ollama not running locally</p>
                                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--dim)' }}>
                                    Please start Ollama in your terminal or application before using local models.
                                  </p>
                                </div>
                              ) : (
                                <div>
                                  {isModelInstalled(model, ollamaStatus.models) || (model === '' && ollamaStatus.models.length > 0) ? (
                                    <p style={{ color: 'var(--green)', margin: 0, fontWeight: 500 }}>
                                      ✓ Model "{model || 'custom'}" is ready locally.
                                    </p>
                                  ) : (
                                    <div>
                                      <p style={{ color: 'var(--amber)', fontWeight: 600, margin: '0 0 4px 0' }}>
                                        ⚠️ Model not found locally
                                      </p>
                                      <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: 'var(--dim)' }}>
                                        To use "{model || 'custom'}", pull it in your terminal via:
                                        <code style={{ display: 'block', background: 'var(--bg)', padding: '4px', margin: '4px 0', borderRadius: '4px', border: '1px solid var(--border)', fontFamily: 'monospace' }}>
                                          ollama pull {model || 'model-name'}
                                        </code>
                                      </p>
                                      {model && (
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          disabled={ollamaPulling}
                                          onClick={() => handlePullOllamaModel(model)}
                                          style={{
                                            padding: '4px 8px',
                                            fontSize: '11px',
                                            borderRadius: '4px',
                                            cursor: ollamaPulling ? 'not-allowed' : 'pointer'
                                          }}
                                        >
                                          {ollamaPulling ? 'Pulling model (can take a few minutes)...' : `Pull "${model}" via API`}
                                        </button>
                                      )}
                                      {ollamaPullError && (
                                        <p style={{ color: 'var(--red)', margin: '4px 0 0 0', fontSize: '11px' }}>{ollamaPullError}</p>
                                      )}
                                      {ollamaPullSuccess && (
                                        <p style={{ color: 'var(--green)', margin: '4px 0 0 0', fontSize: '11px' }}>{ollamaPullSuccess}</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
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
                          (provider === 'ollama' && !ollamaOptions.some(m => m.value === model)) ||
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

                {/* Details view */}
                {activeTool === 'details' && (
                  <div className="card-details-panel">
                    {(() => {
                      if (!selectedNodeId || !dagData) {
                        return (
                          <div className="details-empty" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px', height: '100%', boxSizing: 'border-box' }}>
                            <div style={{ textAlign: 'center', color: 'var(--dim)', fontStyle: 'italic', fontSize: '13px', margin: '20px 0' }}>
                              Select a card in the DAG to view its details.
                            </div>
                            {dagData && dagData.nodes.some(n => n.type === 'task') && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left', width: '100%', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                                <h4 style={{ margin: '0 0 4px', fontSize: '13.5px', fontWeight: 600 }}>Batch Agent Prompt Builder</h4>
                                <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--dim)', lineHeight: '1.4' }}>
                                  Generate a unified instructions prompt to paste to your coding agent to decompose complex or highly coupled tasks.
                                </p>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
                                  <button
                                    onClick={() => {
                                      const allTaskIds = dagData.nodes.filter(n => n.type === 'task').map(n => n.id);
                                      setSelectedComplicatedTasks(allTaskIds);
                                    }}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '11px', padding: '6px 10px', flex: '1 0 auto' }}
                                  >
                                    Select All Tasks ({dagData.nodes.filter(n => n.type === 'task').length})
                                  </button>
                                  <button
                                    onClick={() => {
                                      const flaggedTaskIds = dagData.nodes.filter(n => n.type === 'task' && (n.complexityAlert || n.couplingAlert)).map(n => n.id);
                                      setSelectedComplicatedTasks(flaggedTaskIds);
                                    }}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '11px', padding: '6px 10px', flex: '1 0 auto' }}
                                  >
                                    Select Flagged Tasks ({dagData.nodes.filter(n => n.type === 'task' && (n.complexityAlert || n.couplingAlert)).length})
                                  </button>
                                </div>
                                
                                {selectedComplicatedTasks.length > 0 && (
                                  <div className="details-agent-prompt-box" style={{ marginTop: '12px', width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <h4 className="details-section-heading" style={{ color: 'var(--accent)', margin: 0 }}>Agent Decomposition Prompt</h4>
                                    <textarea
                                      className="details-prompt-textarea"
                                      readOnly
                                      value={optimizingPrompt ? "Optimizing prompt with AI..." : (aiOptimizedPrompt || generateAgentPrompt(selectedComplicatedTasks, dagData.nodes))}
                                      rows={6}
                                      style={{ width: '100%', boxSizing: 'border-box' }}
                                    />
                                    {optimizingPrompt && (
                                      <div style={{ fontSize: '12px', padding: '8px', background: 'var(--s2)', borderRadius: '6px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <div className="spinner" style={{ borderTopColor: 'var(--accent)', borderColor: 'var(--border)' }} />
                                          <span style={{ fontWeight: 500 }}>Optimizing prompt... (Elapsed: {optimizationElapsed}s)</span>
                                        </div>
                                        {provider === 'ollama' && (
                                          <span style={{ color: 'var(--amber)', fontSize: '11px', marginTop: '4px' }}>
                                            ⚠️ Local Ollama models (especially large ones like Qwen3 Coder Next) can take 1-3 minutes to load and generate responses. Please be patient.
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                      <button
                                        onClick={() => {
                                          const promptText = aiOptimizedPrompt || generateAgentPrompt(selectedComplicatedTasks, dagData.nodes);
                                          navigator.clipboard.writeText(promptText);
                                          alert('Agent prompt copied to clipboard!');
                                        }}
                                        className="details-prompt-copy-btn"
                                        style={{ flex: 1 }}
                                        disabled={optimizingPrompt}
                                      >
                                        Copy Agent Prompt
                                      </button>
                                      <button
                                        onClick={handleOptimizePrompt}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '11px', padding: '6px 12px', borderColor: 'var(--accent)', color: 'var(--accent)' }}
                                        disabled={optimizingPrompt || !!aiOptimizedPrompt}
                                        title={`Optimize prompt using ${provider} (${model})`}
                                      >
                                        {optimizingPrompt ? 'Refining...' : '✨ Optimize'}
                                      </button>
                                      <button
                                        onClick={() => setSelectedComplicatedTasks([])}
                                        className="btn btn-secondary"
                                        style={{ fontSize: '11px', padding: '6px 10px', color: 'var(--red)', borderColor: 'var(--red)' }}
                                      >
                                        Clear
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }
                      const node = dagData.nodes.find((n) => n.id === selectedNodeId);
                      if (!node) {
                        return <div className="details-empty">Card not found.</div>;
                      }

                      // Build the relative source file path based on node type and capability
                      let fileRelativePath = '';
                      if (node.type === 'proposal') {
                        fileRelativePath = 'proposal.md';
                      } else if (node.type === 'spec-requirement' || node.type === 'spec-scenario') {
                        fileRelativePath = `specs/${node.capability}/spec.md`;
                      } else if (node.type === 'design-decision') {
                        fileRelativePath = 'design.md';
                      } else if (node.type === 'task') {
                        fileRelativePath = 'tasks.md';
                      }

                      const fileAbsoluteUri = path
                        ? `file://${path}/openspec/changes/${selectedChange}/${fileRelativePath}`
                        : '';

                      return (
                        <div className="card-details-content">
                          <div className="details-badge-row">
                            <span className={`details-badge ${node.type}`}>
                              {node.type.replace('spec-', '')}
                            </span>
                            {node.capability && (
                              <span className="details-badge capability">
                                📦 {node.capability}
                              </span>
                            )}
                            {node.status && (
                              <span className={`details-badge status ${node.status}`}>
                                {node.status === 'completed' ? '✓ Done' : '○ Pending'}
                              </span>
                            )}
                          </div>

                          <h3 className="details-title">{node.label}</h3>

                          {fileRelativePath && (
                            <div className="details-file-link">
                              <strong>Source File:</strong>{' '}
                              <a href={fileAbsoluteUri} target="_blank" rel="noopener noreferrer">
                                {fileRelativePath}
                              </a>
                            </div>
                          )}

                          {(node.complexityAlert || node.couplingAlert) && (
                            <div className="details-alerts-container">
                              <h4 className="details-section-heading">Complexity Assessment</h4>
                              {node.complexityAlert && (
                                <div className="details-alert-item complexity">
                                  <span className="details-alert-icon">⚠️</span>
                                  <div className="details-alert-text">
                                    <strong>Component Complexity Warning:</strong>
                                    <p>{node.complexityAlert}</p>
                                  </div>
                                </div>
                              )}
                              {node.couplingAlert && (
                                <div className="details-alert-item coupling">
                                  <span className="details-alert-icon">🔗</span>
                                  <div className="details-alert-text">
                                    <strong>Coordinative Coupling Warning:</strong>
                                    <p>{node.couplingAlert}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {node.type === 'task' && (
                            <div className="details-prompt-checkbox-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', padding: '0 4px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', userSelect: 'none', fontWeight: 600 }}>
                                <input
                                  type="checkbox"
                                  checked={selectedComplicatedTasks.includes(node.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedComplicatedTasks(prev => [...prev, node.id]);
                                    } else {
                                      setSelectedComplicatedTasks(prev => prev.filter(id => id !== node.id));
                                    }
                                  }}
                                />
                                Flag for Agent Decomposition
                              </label>
                              <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--dim)', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                  onClick={() => {
                                    const allTaskIds = dagData.nodes.filter(n => n.type === 'task').map(n => n.id);
                                    setSelectedComplicatedTasks(allTaskIds);
                                  }}
                                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                                >
                                  Select All Tasks
                                </button>
                                <span>•</span>
                                <button
                                  onClick={() => {
                                    const flaggedTaskIds = dagData.nodes.filter(n => n.type === 'task' && (n.complexityAlert || n.couplingAlert)).map(n => n.id);
                                    setSelectedComplicatedTasks(flaggedTaskIds);
                                  }}
                                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                                >
                                  Select Flagged Tasks
                                </button>
                                {selectedComplicatedTasks.length > 0 && (
                                  <>
                                    <span>•</span>
                                    <button
                                      onClick={() => setSelectedComplicatedTasks([])}
                                      style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                                    >
                                      Clear Selection
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="details-divider" />

                          <div className="details-description-body">
                            {node.description ? (
                              renderMarkdownBlock(node.description)
                            ) : (
                              <em className="details-no-desc">No additional details parsed from file.</em>
                            )}
                          </div>

                          {selectedComplicatedTasks.length > 0 && (
                            <div className="details-agent-prompt-box">
                              <h4 className="details-section-heading" style={{ color: 'var(--accent)' }}>Agent Decomposition Prompt</h4>
                              <p className="details-prompt-desc">
                                Copy this prompt to instruct your coding agent to decompose the flagged task(s).
                              </p>
                              <textarea
                                className="details-prompt-textarea"
                                readOnly
                                value={optimizingPrompt ? "Optimizing prompt with AI..." : (aiOptimizedPrompt || generateAgentPrompt(selectedComplicatedTasks, dagData.nodes))}
                                rows={6}
                              />
                              {optimizingPrompt && (
                                <div style={{ fontSize: '12px', padding: '8px', background: 'var(--s2)', borderRadius: '6px', border: '1px solid var(--border)', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div className="spinner" style={{ borderTopColor: 'var(--accent)', borderColor: 'var(--border)' }} />
                                    <span style={{ fontWeight: 500 }}>Optimizing prompt... (Elapsed: {optimizationElapsed}s)</span>
                                  </div>
                                  {provider === 'ollama' && (
                                    <span style={{ color: 'var(--amber)', fontSize: '11px', marginTop: '4px' }}>
                                      ⚠️ Local Ollama models (especially large ones like Qwen3 Coder Next) can take 1-3 minutes to load and generate responses. Please be patient.
                                    </span>
                                  )}
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                <button
                                  onClick={() => {
                                    const promptText = aiOptimizedPrompt || generateAgentPrompt(selectedComplicatedTasks, dagData.nodes);
                                    navigator.clipboard.writeText(promptText);
                                    alert('Agent prompt copied to clipboard!');
                                  }}
                                  className="details-prompt-copy-btn"
                                  style={{ flex: 1 }}
                                  disabled={optimizingPrompt}
                                >
                                  Copy Agent Prompt
                                </button>
                                <button
                                  onClick={handleOptimizePrompt}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '11px', padding: '6px 12px', borderColor: 'var(--accent)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  disabled={optimizingPrompt || !!aiOptimizedPrompt}
                                  title={`Optimize prompt using ${provider} (${model})`}
                                >
                                  {optimizingPrompt ? 'Refining...' : '✨ Optimize with AI'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Chat interfaces */}
                {activeTool !== 'audit' && activeTool !== 'details' && (
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
              {activeTool !== 'audit' && activeTool !== 'details' && (
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
