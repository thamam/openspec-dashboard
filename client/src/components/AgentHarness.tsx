import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
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
}

interface ChatMessage {
  role: 'user' | 'agent';
  content: string;
}

export function AgentHarness({ repoPath, activeChange }: Props) {
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
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket: Socket = io('http://localhost:3011');
    socketRef.current = socket;
    
    socket.on('connect', () => {
      socket.emit('set_repo_path', repoPath);
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
        return [...prev, { role: 'agent', content: chunk }];
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
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentOutput]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAgentTyping]);

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isAgentTyping || !socketRef.current) return;
    
    const msg = chatInput;
    setChatHistory(prev => [...prev, { role: 'user', content: msg }]);
    setChatInput('');
    setIsAgentTyping(true);
    
    const context = {
      activeChange: activeChange || 'None currently selected'
    };
    
    socketRef.current.emit('chat_message', { message: msg, context });
  };

  const handleAutofix = () => {
    if (!activeFile || !analysisResult || !socketRef.current) return;
    setIsFixing(true);
    socketRef.current.emit('trigger_autofix', { file: activeFile, message: analysisResult.message });
  };

  if (!isExpanded) {
    return (
      <div className="agent-harness-collapsed" onClick={() => setIsExpanded(true)}>
        <span className="agent-icon">🤖</span>
        <span>Agent Offline</span>
      </div>
    );
  }

  return (
    <div className="agent-harness">
      <div className="agent-harness-header">
        <div className="agent-harness-title">
          <span className="agent-icon">🤖</span>
          <strong>AntiGravity Harness</strong>
        </div>
        <button className="collapse-btn" onClick={() => setIsExpanded(false)}>_</button>
      </div>

      <div className="agent-harness-tabs">
        <button 
          className={`agent-tab ${activeTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveTab('analysis')}
        >
          Live Analysis
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
              <span className="pulse-indicator"></span>
              Watching {repoPath} for OpenSpec changes...
            </div>
            
            <div className="events-list" style={{ flex: 1, overflowY: 'auto' }}>
              {events.map((e, idx) => (
                <div key={idx} className="mock-event">
                  <div className="event-time">{new Date(e.timestamp).toLocaleTimeString()}</div>
                  <div className="event-action">Detected {e.action} in <code>{e.fileName || e.file}</code></div>
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>

            <div className="mock-agent-thought">
              <div className="thought-header">Agent is thinking...</div>
              <div className="thought-body" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {agentOutput || "Waiting for file changes..."}
                </pre>
                <div ref={outputEndRef} />
              </div>
              {analysisResult && (
                <div style={{
                  marginTop: '10px',
                  padding: '10px',
                  borderRadius: '6px',
                  backgroundColor: analysisResult.status === 'warning' ? 'rgba(255, 123, 114, 0.1)' : 'rgba(86, 211, 100, 0.1)',
                  border: `1px solid ${analysisResult.status === 'warning' ? '#ff7b72' : '#56d364'}`,
                  color: analysisResult.status === 'warning' ? '#ff7b72' : '#56d364'
                }}>
                  <strong>{analysisResult.status === 'warning' ? '⚠️ WARNING' : '✅ SUCCESS'}: </strong>
                  {analysisResult.message}
                  {analysisResult.status === 'warning' && (
                    <button 
                      onClick={handleAutofix}
                      disabled={isFixing}
                      style={{ 
                        marginTop: '10px', 
                        padding: '6px 12px', 
                        display: 'block', 
                        cursor: isFixing ? 'not-allowed' : 'pointer',
                        backgroundColor: 'var(--panel-bg)',
                        color: 'var(--text-color)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px'
                      }}
                    >
                      {isFixing ? 'Fixing...' : 'Auto-Fix Issue'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mock-insight-card warning">
              <h4>⚠️ UX Philosophy Violation</h4>
              <p>The updated spec introduces a dense technical table by default. According to <strong>ux-philosophy.md</strong>, we should use Progressive Disclosure.</p>
              <div className="insight-actions">
                <button className="action-btn primary">Auto-Fix Spec</button>
                <button className="action-btn">Ignore</button>
              </div>
            </div>
            
            <div className="mock-insight-card success">
              <h4>✅ Traceability Complete</h4>
              <p>All newly generated tasks are properly linked back to architectural decisions.</p>
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="chat-view">
            <div className="chat-history" style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
              {chatHistory.map((msg, idx) => (
                <div key={idx} style={{ 
                  marginBottom: '10px', 
                  padding: '8px', 
                  borderRadius: '6px', 
                  backgroundColor: msg.role === 'user' ? 'var(--input-bg)' : 'var(--bg-color)',
                  color: msg.role === 'user' ? 'var(--text-color)' : 'var(--accent)',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  whiteSpace: 'pre-wrap'
                }}>
                  <strong>{msg.role === 'user' ? 'You' : 'Agent'}: </strong>
                  {msg.content}
                </div>
              ))}
              {isAgentTyping && (
                <div style={{ color: 'var(--text-muted)' }}>Agent is typing...</div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input" onSubmit={handleChatSubmit}>
              <input 
                type="text" 
                placeholder="Ask the agent to modify the dashboard..." 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={isAgentTyping}
              />
              <button type="submit" disabled={isAgentTyping || !chatInput.trim()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
