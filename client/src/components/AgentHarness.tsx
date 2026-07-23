import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Artifacts } from '../types';
import './AgentHarness.css';

interface AgentEvent {
  type: 'file_change' | 'analysis_chunk' | 'analysis_complete';
  action?: string;
  file?: string;
  fileName?: string;
  chunk?: string;
  result?: { status: 'success' | 'warning', message: string };
  timestamp: string;
}

interface Props {
  repoPath: string;
  activeChange: string | null;
  agentProvider?: string;
  artifacts?: Artifacts;
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp?: string;
}

export function AgentHarness({ repoPath, activeChange, agentProvider = 'codex', artifacts }: Props) {
  const [activeTab, setActiveTab] = useState<'analysis' | 'chat'>('analysis');
  const [isExpanded, setIsExpanded] = useState(true);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  const [agentOutput, setAgentOutput] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<{ status: 'success' | 'warning', message: string } | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [connectionState, setConnectionState] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const getSocketUrl = () => {
      if (typeof window !== 'undefined') {
        if (window.location.port === '5183' || window.location.port === '5173') {
          return `${window.location.protocol}//${window.location.hostname}:3011`;
        }
        return window.location.origin;
      }
      return 'http://localhost:3011';
    };

    const socket: Socket = io(getSocketUrl());
    socketRef.current = socket;
    
    socket.on('connect', () => {
      setConnectionState('connected');
      socket.emit('set_repo_path', repoPath);
    });

    socket.on('disconnect', () => {
      setConnectionState('disconnected');
    });

    socket.on('connect_error', () => {
      setConnectionState('disconnected');
    });

    socket.on('agent_event', (event: AgentEvent) => {
      if (event.type === 'file_change') {
        setEvents(prev => [...prev, event]);
        if (event.file) setActiveFile(event.file);
        setAgentOutput('');
        setAnalysisResult(null);
      } else if (event.type === 'analysis_chunk' && event.chunk) {
        setAgentOutput(prev => prev + event.chunk!);
      } else if (event.type === 'analysis_complete' && event.result) {
        setAnalysisResult(event.result);
      }
    });

    socket.on('autofix_complete', () => {
      setIsFixing(false);
      setAnalysisResult({ status: 'success', message: 'Auto-fix applied successfully.' });
    });

    socket.on('chat_reply_chunk', (chunk: string) => {
      setChatHistory(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'agent') {
          const updated = [...prev];
          updated[updated.length - 1] = { ...last, content: last.content + chunk };
          return updated;
        }
        return [...prev, { role: 'agent', content: chunk, timestamp: new Date().toLocaleTimeString() }];
      });
    });

    socket.on('chat_reply_complete', () => {
      setIsAgentTyping(false);
    });

    socket.on('chat_history', (history: ChatMessage[]) => {
      setChatHistory(history);
    });

    return () => {
      socket.disconnect();
    };
  }, [repoPath]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [events]);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [agentOutput]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [chatHistory, isAgentTyping]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAgentTyping || !socketRef.current) return;
    
    const msg = chatInput;
    setChatHistory(prev => [...prev, { role: 'user', content: msg, timestamp: new Date().toLocaleTimeString() }]);
    setChatInput('');
    setIsAgentTyping(true);
    
    const context = {
      activeChange: activeChange || 'None currently selected',
      agentProvider: agentProvider
    };
    
    socketRef.current.emit('chat_message', { message: msg, context });
  };

  const handleAutofix = () => {
    if (!activeFile || !analysisResult || !socketRef.current) return;
    setIsFixing(true);
    socketRef.current.emit('trigger_autofix', { file: activeFile, message: analysisResult.message });
  };

  const clearChat = () => {
    setChatHistory([]);
  };

  if (!isExpanded) {
    return (
      <div className="agent-harness-collapsed" onClick={() => setIsExpanded(true)} title="Expand Agent Pane">
        <span className={`status-dot ${connectionState}`}></span>
        <span className="agent-icon">🤖</span>
        <span>Agent ({agentProvider.toUpperCase()})</span>
      </div>
    );
  }

  const linkagesCount = artifacts?.linkages?.length || 0;

  return (
    <div className="agent-harness">
      <div className="agent-harness-header">
        <div className="agent-harness-title">
          <span className={`status-dot ${connectionState}`} title={`Socket: ${connectionState}`}></span>
          <span className="agent-icon">🤖</span>
          <strong>Agent Harness</strong>
          <span className="provider-pill">{agentProvider.toUpperCase()}</span>
          {activeChange && activeChange !== 'main' && (
            <span className="change-pill" title={`Scope: ${activeChange}`}>#{activeChange}</span>
          )}
        </div>
        <button className="collapse-btn" onClick={() => setIsExpanded(false)} title="Collapse Agent Pane">_</button>
      </div>

      <div className="agent-harness-tabs">
        <button 
          className={`agent-tab ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('analysis')}
        >
          Live Analysis {events.length > 0 && <span className="tab-badge">{events.length}</span>}
        </button>
        <button 
          className={`agent-tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          Interactive Chat
        </button>
      </div>

      <div className="agent-harness-content">
        {activeTab === 'analysis' && (
          <div className="analysis-view">
            <div className="analysis-status">
              <span className={`pulse-indicator ${connectionState === 'connected' ? 'active' : ''}`}></span>
              <span>Watching <code>{repoPath}</code> for OpenSpec changes...</span>
            </div>
            
            <div className="events-list">
              {events.length === 0 ? (
                <div className="events-empty">
                  <span>No file modifications detected yet. Listening for changes...</span>
                </div>
              ) : (
                events.map((e, idx) => (
                  <div key={idx} className="agent-event mock-event">
                    <span className="event-time">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    <span className="event-action">
                      Detected <strong>{e.action}</strong> in <code>{e.fileName || e.file}</code>
                    </span>
                  </div>
                ))
              )}
              <div ref={eventsEndRef} />
            </div>

            <div className="agent-thought-container mock-agent-thought">
              <div className="thought-header">
                <span>Agent Analysis Output</span>
                {agentOutput && <span className="streaming-indicator">Streaming...</span>}
              </div>
              <div className="thought-body">
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {agentOutput || "Waiting for file events or change triggers..."}
                </pre>
                <div ref={outputEndRef} />
              </div>

              {analysisResult && (
                <div className={`analysis-result-banner ${analysisResult.status}`}>
                  <div className="banner-title">
                    <strong>{analysisResult.status === 'warning' ? '⚠️ WARNING' : '✅ SUCCESS'}: </strong>
                    <span>{analysisResult.message}</span>
                  </div>
                  {analysisResult.status === 'warning' && (
                    <button 
                      onClick={handleAutofix}
                      disabled={isFixing}
                      className="autofix-btn"
                    >
                      {isFixing ? 'Applying Auto-Fix...' : 'Auto-Fix Issue'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Dynamic Insight Cards */}
            {analysisResult?.status === 'warning' && (
              <div className="agent-insight-card mock-insight-card warning">
                <h4>⚠️ Spec / UX Policy Alert</h4>
                <p>{analysisResult.message || 'File modification contains potential UX or policy deviations.'}</p>
                <div className="insight-actions">
                  <button className="action-btn primary" onClick={handleAutofix} disabled={isFixing}>
                    {isFixing ? 'Fixing...' : 'Auto-Fix Spec'}
                  </button>
                  <button className="action-btn" onClick={() => setAnalysisResult(null)}>Dismiss</button>
                </div>
              </div>
            )}

            {linkagesCount > 0 && (
              <div className="agent-insight-card mock-insight-card success">
                <h4>✅ Traceability Active</h4>
                <p>{linkagesCount} semantic linkages verified between requirements, decisions, and tasks.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="chat-view">
            <div className="chat-toolbar">
              <span className="chat-provider-info">Provider: <strong>{agentProvider.toUpperCase()}</strong></span>
              {chatHistory.length > 0 && (
                <button className="clear-chat-btn" onClick={clearChat} title="Clear conversation history">Clear</button>
              )}
            </div>
            
            <div className="chat-history">
              {chatHistory.length === 0 ? (
                <div className="chat-empty">
                  <span className="agent-icon-large">🤖</span>
                  <p>Ask the agent to modify specs, analyze proposals, or automate tasks.</p>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div key={idx} className={`chat-bubble ${msg.role}`}>
                    <div className="chat-bubble-header">
                      <strong>{msg.role === 'user' ? 'You' : `Agent (${agentProvider})`}</strong>
                      {msg.timestamp && <span className="msg-time">{msg.timestamp}</span>}
                    </div>
                    <div className="chat-bubble-body">{msg.content}</div>
                  </div>
                ))
              )}
              {isAgentTyping && (
                <div className="typing-indicator">
                  <span>Agent is thinking...</span>
                  <span className="dot-flashing"></span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form className="chat-input-form" onSubmit={handleChatSubmit}>
              <input 
                type="text" 
                className="chat-input"
                placeholder="Ask the agent to modify the dashboard..." 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={isAgentTyping}
              />
              <button type="submit" className="chat-send-btn" disabled={isAgentTyping || !chatInput.trim()} title="Send Message">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
