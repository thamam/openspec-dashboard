import React, { useState, useEffect } from 'react';
import { Artifacts } from '../../../types';

interface Props {
  artifacts: Artifacts;
  activeChange: string;
}

interface Comment {
  id: string;
  tab: string;
  quote: string;
  text: string;
  isDraft: boolean;
}

const TABS: { label: string; key: 'proposal' | 'spec' | 'design' | 'tasks' }[] = [
  { label: 'Proposal', key: 'proposal' },
  { label: 'Specs', key: 'spec' },
  { label: 'Design', key: 'design' },
  { label: 'Tasks', key: 'tasks' }
];

export const RawView: React.FC<Props> = ({ artifacts, activeChange }) => {
  const [activeTab, setActiveTab] = useState('Proposal');
  const [comments, setComments] = useState<Comment[]>([]);
  const [selection, setSelection] = useState<{ quote: string, x: number, y: number } | null>(null);
  
  const handleMouseUp = (e: React.MouseEvent) => {
    const text = window.getSelection()?.toString().trim();
    if (text && text.length > 0) {
      setSelection({
        quote: text,
        x: e.clientX,
        y: e.clientY
      });
    } else {
      setSelection(null);
    }
  };

  const addComment = () => {
    if (!selection) return;
    setComments(prev => [...prev, {
      id: Date.now().toString(),
      tab: activeTab,
      quote: selection.quote,
      text: '',
      isDraft: true
    }]);
    setSelection(null);
  };

  const saveComment = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, text, isDraft: false } : c));
  };

  const deleteComment = (id: string) => {
    setComments(prev => prev.filter(c => c.id !== id));
  };

  const sendFeedback = async () => {
    const finalizedComments = comments.filter(c => !c.isDraft && c.text.trim().length > 0);
    if (finalizedComments.length === 0) return;

    let message = `I have some feedback on the artifacts:\n`;
    finalizedComments.forEach(c => {
      message += `- In '${c.tab}' regarding "${c.quote}": ${c.text}\n`;
    });

    try {
      await fetch('http://localhost:3011/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeName: activeChange, message })
      });
      setComments([]); // clear after sending
    } catch (e) {
      console.error('Failed to send feedback', e);
    }
  };
  
  const [furthestTab, setFurthestTab] = useState('Proposal');

  useEffect(() => {
    let furthest = 'Proposal';
    for (const tab of TABS) {
      if (artifacts[tab.key] && artifacts[tab.key].length > 0) {
        furthest = tab.label;
      }
    }
    if (furthest !== furthestTab) {
      setFurthestTab(furthest);
      setActiveTab(furthest);
    }
  }, [artifacts, furthestTab]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', flex: 1 }}>
      <div className="tabs">
        {TABS.map(tab => {
          const isPopulated = artifacts[tab.key] && artifacts[tab.key].length > 0;
          const statusClass = isPopulated ? 'completed' : 'pending';
          return (
            <div 
              key={tab.label} 
              id={`tab-${tab.key}`}
              className={`tab ${activeTab === tab.label ? 'active' : ''} ${statusClass}`}
              onClick={() => setActiveTab(tab.label)}
            >
              {isPopulated ? '✓ ' : '⏳ '}
              {tab.label}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div 
          className="artifact-content markdown-preview" 
          id="artifact-content" 
          style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
          onMouseUp={handleMouseUp}
        >
          {activeTab === 'Tasks' && (
            <pre>{artifacts.tasks || 'No tasks found.'}</pre>
          )}
          {activeTab === 'Proposal' && <pre>{artifacts.proposal}</pre>}
          {activeTab === 'Specs' && <pre>{artifacts.spec}</pre>}
          {activeTab === 'Design' && <pre>{artifacts.design}</pre>}
          
          {selection && (
            <button 
              style={{
                position: 'fixed',
                top: selection.y + 10,
                left: selection.x + 10,
                zIndex: 1000,
                backgroundColor: '#1f6feb',
                color: 'white',
                border: '1px solid #388bfd',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
              }}
              onClick={addComment}
            >
              💬 Add Comment
            </button>
          )}
        </div>
        {comments.length > 0 && (
          <div className="feedback-drawer" style={{ width: '300px', backgroundColor: '#0d1117', borderLeft: '1px solid #30363d', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '15px', borderBottom: '1px solid #30363d', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
              Feedback ({comments.length})
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {comments.map(c => (
                <div key={c.id} style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '5px' }}>In {c.tab}</div>
                  <div style={{ fontSize: '12px', borderLeft: '2px solid #388bfd', paddingLeft: '8px', color: '#c9d1d9', marginBottom: '10px', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    "{c.quote}"
                  </div>
                  {c.isDraft ? (
                    <div>
                      <textarea 
                        autoFocus
                        style={{ width: '100%', height: '60px', backgroundColor: '#0d1117', border: '1px solid #30363d', color: '#c9d1d9', padding: '8px', borderRadius: '4px', resize: 'none', marginBottom: '8px' }}
                        placeholder="Add your feedback..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            saveComment(c.id, e.currentTarget.value);
                          }
                        }}
                        onBlur={(e) => saveComment(c.id, e.target.value)}
                      />
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: '#c9d1d9', marginBottom: '8px' }}>
                      {c.text}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button onClick={() => deleteComment(c.id)} style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', fontSize: '12px' }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '15px', borderTop: '1px solid #30363d' }}>
              <button 
                onClick={sendFeedback}
                style={{ width: '100%', padding: '10px', backgroundColor: '#238636', color: 'white', border: '1px solid rgba(240, 246, 252, 0.1)', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Send Feedback to Agent
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
