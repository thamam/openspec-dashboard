import React, { useState, useEffect, useRef } from 'react';
import './ReviewChat.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ReviewChatProps {
  repoPath: string;
  changeName: string;
}

export default function ReviewChat({ repoPath, changeName }: ReviewChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState<'gemini' | 'ollama' | 'custom'>('gemini');
  const [model, setModel] = useState('gemini-1.5-flash');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Set default models based on selected provider
  useEffect(() => {
    if (provider === 'gemini') {
      setModel('gemini-1.5-flash');
    } else if (provider === 'ollama') {
      setModel('gemma2');
    } else if (provider === 'custom') {
      setModel('gpt-4o');
    }
  }, [provider]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;

    const userMessage = { role: 'user' as const, content: textToSend };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`/api/changes/${encodeURIComponent(changeName)}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repoPath,
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
        throw new Error(parsedErr || 'Failed to get response');
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'assistant' as const, content: data.reply }]);
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  // Inline markdown formatter helper
  const renderMarkdown = (text: string) => {
    if (!text) return null;

    const blocks = text.split(/(```[\s\S]*?```)/g);

    return blocks.map((block, idx) => {
      if (block.startsWith('```')) {
        const content = block.replace(/^```[a-zA-Z]*\n?|```$/g, '');
        return (
          <pre key={idx} className="markdown-code-block">
            <code>{content}</code>
          </pre>
        );
      }

      const lines = block.split('\n');
      return lines.map((line, lidx) => {
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          const content = line.trim().substring(2);
          return (
            <li key={`${idx}-${lidx}`} className="markdown-list-item">
              {formatInlineMarkdown(content)}
            </li>
          );
        }

        return (
          <p key={`${idx}-${lidx}`} className="markdown-para">
            {formatInlineMarkdown(line)}
          </p>
        );
      });
    });
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

  return (
    <div className="review-chat-card">
      <div className="review-chat-header">
        <h3>OpenSpec Traceability Auditor</h3>
        <button
          type="button"
          className="settings-toggle-btn"
          onClick={() => setShowSettings(!showSettings)}
          aria-expanded={showSettings}
        >
          {showSettings ? '⚙️ Hide Settings' : '⚙️ Show Settings'}
        </button>
      </div>

      {showSettings && (
        <div className="chat-settings-panel">
          <div className="chat-settings-grid">
            <div className="settings-field">
              <label htmlFor="chat-provider-select">Provider:</label>
              <select
                id="chat-provider-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value as any)}
              >
                <option value="gemini">Gemini (API Key required)</option>
                <option value="ollama">Ollama (Local Open Source)</option>
                <option value="custom">Custom OpenAI-Compatible</option>
              </select>
            </div>

            <div className="settings-field">
              <label htmlFor="chat-model-input">Model Name:</label>
              <input
                id="chat-model-input"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            {provider === 'custom' && (
              <>
                <div className="settings-field full-width">
                  <label htmlFor="chat-endpoint-input">Custom Endpoint URL:</label>
                  <input
                    id="chat-endpoint-input"
                    type="text"
                    placeholder="e.g. https://api.together.xyz/v1"
                    value={customEndpoint}
                    onChange={(e) => setCustomEndpoint(e.target.value)}
                  />
                </div>
                <div className="settings-field full-width">
                  <label htmlFor="chat-key-input">Custom API Key (Optional):</label>
                  <input
                    id="chat-key-input"
                    type="password"
                    placeholder="Enter API key"
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {provider === 'gemini' && (
            <p className="provider-hint-text">
              Uses server's <code>GEMINI_API_KEY</code> environment variable.
            </p>
          )}

          {provider === 'ollama' && (
            <p className="provider-hint-text">
              Ensure Ollama is running locally: <code>ollama run {model}</code>
            </p>
          )}
        </div>
      )}

      {/* Pre-canned Prompt Shortcuts */}
      <div className="chat-shortcuts-row">
        <button
          type="button"
          onClick={() => handleSend('Audit Traceability')}
          disabled={loading}
          className="shortcut-btn"
        >
          🔍 Audit Traceability
        </button>
        <button
          type="button"
          onClick={() => handleSend('List Incomplete Tasks')}
          disabled={loading}
          className="shortcut-btn"
        >
          📋 List Incomplete Tasks
        </button>
        <button
          type="button"
          onClick={() => handleSend('Summarize Decisions')}
          disabled={loading}
          className="shortcut-btn"
        >
          💡 Summarize Decisions
        </button>
      </div>

      {/* Chat History Log */}
      <div className="chat-messages-log">
        {messages.length === 0 && (
          <div className="chat-welcome-placeholder">
            <p>Welcome! Ask the auditor questions about the current changes, traceability linkage, or missing requirements.</p>
          </div>
        )}

        {messages.map((m, idx) => (
          <div key={idx} className={`chat-bubble-wrapper ${m.role}`}>
            <div className="chat-bubble-sender">
              {m.role === 'user' ? 'You' : 'Auditor'}
            </div>
            <div className="chat-bubble-content">
              {m.role === 'user' ? m.content : renderMarkdown(m.content)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-bubble-wrapper assistant loading-state">
            <div className="chat-bubble-sender">Auditor</div>
            <div className="chat-bubble-content">
              <span className="chat-spinner"></span> Thinking...
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {error && (
        <div className="chat-error-banner">
          <strong>Error: </strong> {error}
        </div>
      )}

      {/* Input Field Form */}
      <form onSubmit={handleFormSubmit} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a question or message..."
          disabled={loading}
          required
        />
        <button type="submit" disabled={loading || !input.trim()} className="chat-send-btn">
          Send
        </button>
      </form>
    </div>
  );
}
