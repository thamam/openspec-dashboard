import React, { useState, useEffect, useRef } from 'react';
import './BrainstormWizard.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface DecisionItem {
  status: 'OPEN' | 'RESOLVED';
  text: string;
}

interface BrainstormWizardProps {
  repoPath: string;
  onCommitSuccess: (changeName: string) => void;
  onCancel: () => void;
}

export default function BrainstormWizard({ repoPath, onCommitSuccess, onCancel }: BrainstormWizardProps) {
  // Wizard steps: 'start' | 'chat'
  const [step, setStep] = useState<'start' | 'chat'>('start');
  const [changeName, setChangeName] = useState('');
  const [initialIdea, setInitialIdea] = useState('');
  
  // LLM Config
  const [provider, setProvider] = useState<'gemini' | 'ollama' | 'custom'>('gemini');
  const [model, setModel] = useState('gemini-1.5-flash');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Chat states
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Default models based on provider
  useEffect(() => {
    if (provider === 'gemini') {
      setModel('gemini-1.5-flash');
    } else if (provider === 'ollama') {
      setModel('gemma2');
    } else if (provider === 'custom') {
      setModel('gpt-4o');
    }
  }, [provider]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, loading]);

  // Parse decisions list and clean text from raw LLM reply
  const parseDecisions = (reply: string): { cleanText: string; decisions: DecisionItem[] } => {
    const decisions: DecisionItem[] = [];
    let cleanText = reply;

    const match = reply.match(/\[DECISIONS\]([\s\S]*?)\[END_DECISIONS\]/);
    if (match) {
      const lines = match[1].split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- [OPEN]') || trimmed.startsWith('- [RESOLVED]')) {
          const status = trimmed.includes('[RESOLVED]') ? 'RESOLVED' : 'OPEN';
          const text = trimmed.replace(/^-\s*\[(?:OPEN|RESOLVED)\]\s*/, '');
          if (text) {
            decisions.push({ status, text });
          }
        }
      }
      cleanText = reply.replace(/\[DECISIONS\][\s\S]*?\[END_DECISIONS\]\n?/, '').trim();
    }
    return { cleanText, decisions };
  };

  // Extract recommended answer if any exists in the reply
  const parseRecommendation = (text: string): string | null => {
    const match = text.match(/Recommended:\s*(.*)/i);
    return match ? match[1].trim() : null;
  };

  // Get decisions from the latest assistant message
  const getLatestDecisions = (): DecisionItem[] => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        const { decisions } = parseDecisions(messages[i].content);
        if (decisions.length > 0) return decisions;
      }
    }
    return [];
  };

  // Get recommendation from the latest assistant message
  const getLatestRecommendation = (): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        const { cleanText } = parseDecisions(messages[i].content);
        const rec = parseRecommendation(cleanText);
        if (rec) return rec;
      }
    }
    return null;
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setError(null);

    if (!changeName.trim()) {
      setValidationError('Change name is required.');
      return;
    }

    const kebabRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    if (!kebabRegex.test(changeName)) {
      setValidationError('Change name must be kebab-case (e.g. my-feature).');
      return;
    }

    if (!initialIdea.trim()) {
      setValidationError('Initial raw feature idea is required.');
      return;
    }

    setLoading(true);
    setStep('chat');

    try {
      const response = await fetch('/api/brainstorm/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath,
          changeName,
          initialIdea,
          provider,
          model,
          customEndpoint,
          customApiKey,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let parsedErr = errText;
        try {
          parsedErr = JSON.parse(errText).error || errText;
        } catch {}
        throw new Error(parsedErr || 'Failed to start brainstorming session');
      }

      const data = await response.json();
      setMessages([
        { role: 'user', content: `Help me design this feature: ${initialIdea}` },
        { role: 'assistant', content: data.reply }
      ]);
    } catch (err: any) {
      setError(err.message || 'An error occurred while starting.');
      setStep('start');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMessage = { role: 'user' as const, content: textToSend };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/brainstorm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath,
          changeName,
          initialIdea,
          messages: updatedMessages,
          provider,
          model,
          customEndpoint,
          customApiKey,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let parsedErr = errText;
        try {
          parsedErr = JSON.parse(errText).error || errText;
        } catch {}
        throw new Error(parsedErr || 'Failed to get chat response');
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    setError(null);
    setCommitLoading(true);

    try {
      const response = await fetch('/api/brainstorm/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath,
          changeName,
          initialIdea,
          messages,
          provider,
          model,
          customEndpoint,
          customApiKey,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        let parsedErr = errText;
        try {
          parsedErr = JSON.parse(errText).error || errText;
        } catch {}
        throw new Error(parsedErr || 'Failed to commit changes');
      }

      onCommitSuccess(changeName);
    } catch (err: any) {
      setError(err.message || 'An error occurred during commit.');
    } finally {
      setCommitLoading(false);
    }
  };

  const formatInlineMarkdown = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, pidx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pidx}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={pidx} className="markdown-inline-code">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const renderMarkdownText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, lidx) => {
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const content = line.trim().substring(2);
        return (
          <li key={lidx} className="markdown-list-item">
            {formatInlineMarkdown(content)}
          </li>
        );
      }
      return (
        <p key={lidx} className="markdown-para">
          {formatInlineMarkdown(line)}
        </p>
      );
    });
  };

  const latestDecisions = getLatestDecisions();
  const latestRecommendation = getLatestRecommendation();

  return (
    <div className="brainstorm-overlay">
      <div className="brainstorm-modal">
        <header className="brainstorm-header">
          <h2>Brainstorm & Stress-Test Feature</h2>
          <button onClick={onCancel} className="close-btn" aria-label="Close modal">×</button>
        </header>

        {step === 'start' ? (
          <form onSubmit={handleStart} className="brainstorm-start-form">
            {validationError && (
              <div className="validation-error-banner">{validationError}</div>
            )}
            {error && <div className="error-banner">{error}</div>}

            <div className="form-group">
              <label htmlFor="temp-change-name">Temporary Change Name (kebab-case):</label>
              <input
                id="temp-change-name"
                type="text"
                value={changeName}
                onChange={(e) => setChangeName(e.target.value)}
                placeholder="e.g. dynamic-model-selector"
              />
            </div>

            <div className="form-group">
              <label htmlFor="raw-feature-idea">Initial Raw Feature Idea:</label>
              <textarea
                id="raw-feature-idea"
                value={initialIdea}
                onChange={(e) => setInitialIdea(e.target.value)}
                placeholder="Describe your raw feature idea or requirements here..."
                rows={5}
              />
            </div>

            <div className="settings-accordion">
              <button
                type="button"
                className="settings-toggle"
                onClick={() => setShowSettings(!showSettings)}
              >
                {showSettings ? '⚙️ Hide AI Model Options' : '⚙️ Configure AI Model Options'}
              </button>

              {showSettings && (
                <div className="settings-grid">
                  <div className="form-group">
                    <label htmlFor="brainstorm-provider">LLM Provider:</label>
                    <select
                      id="brainstorm-provider"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as any)}
                    >
                      <option value="gemini">Gemini (AGY Server Config)</option>
                      <option value="ollama">Ollama (Local Open Source)</option>
                      <option value="custom">Custom OpenAI Endpoint</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="brainstorm-model">Model Name:</label>
                    <input
                      id="brainstorm-model"
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                    />
                  </div>

                  {provider === 'custom' && (
                    <>
                      <div className="form-group full-width">
                        <label htmlFor="brainstorm-endpoint">Custom Endpoint URL:</label>
                        <input
                          id="brainstorm-endpoint"
                          type="text"
                          value={customEndpoint}
                          onChange={(e) => setCustomEndpoint(e.target.value)}
                          placeholder="e.g. http://localhost:8080/v1"
                        />
                      </div>
                      <div className="form-group full-width">
                        <label htmlFor="brainstorm-api-key">Custom API Key:</label>
                        <input
                          id="brainstorm-api-key"
                          type="password"
                          value={customApiKey}
                          onChange={(e) => setCustomApiKey(e.target.value)}
                          placeholder="API Key if needed"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? 'Starting Grill Session...' : 'Start Brainstorming'}
              </button>
              <button type="button" onClick={onCancel} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="brainstorm-workspace">
            <div className="brainstorm-sidebar">
              <h3>Decision Tree Progress</h3>
              {latestDecisions.length === 0 ? (
                <p className="no-decisions">No decisions tracked yet.</p>
              ) : (
                <ul className="decision-tree-list">
                  {latestDecisions.map((d, idx) => (
                    <li key={idx} className={`decision-item ${d.status.toLowerCase()}`}>
                      <span className={`status-badge ${d.status.toLowerCase()}`}>
                        {d.status}
                      </span>
                      <span className="decision-text">{d.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="brainstorm-chat-container">
              <div className="brainstorm-chat-history">
                {messages.map((m, idx) => {
                  if (m.role === 'user' && idx === 0) return null; // skip initial prompt in chat view
                  const { cleanText } = parseDecisions(m.content);
                  
                  return (
                    <div key={idx} className={`chat-bubble-wrapper ${m.role}`}>
                      <div className="chat-bubble-sender">
                        {m.role === 'user' ? 'You' : 'Auditor'}
                      </div>
                      <div className="chat-bubble-content">
                        {m.role === 'user' ? m.content : renderMarkdownText(cleanText)}
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="chat-bubble-wrapper assistant loading-state">
                    <div className="chat-bubble-sender">Auditor</div>
                    <div className="chat-bubble-content">
                      <span className="chat-spinner"></span> Stress-testing proposal...
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {error && <div className="error-banner">{error}</div>}

              <div className="brainstorm-actions-area">
                {latestRecommendation && (
                  <button
                    type="button"
                    onClick={() => handleSend(latestRecommendation)}
                    disabled={loading || commitLoading}
                    className="btn btn-secondary accept-rec-btn"
                  >
                    Accept Recommendation: <em>"{latestRecommendation}"</em>
                  </button>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend(input);
                  }}
                  className="brainstorm-chat-input"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a question or message..."
                    disabled={loading || commitLoading}
                    required
                  />
                  <button
                    type="submit"
                    disabled={loading || commitLoading || !input.trim()}
                    className="btn btn-primary"
                  >
                    Send
                  </button>
                </form>

                <div className="commit-actions">
                  <button
                    type="button"
                    onClick={handleCommit}
                    disabled={loading || commitLoading || messages.length < 2}
                    className="btn btn-success commit-btn"
                  >
                    {commitLoading ? 'Writing files...' : 'Commit & Generate Change'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
