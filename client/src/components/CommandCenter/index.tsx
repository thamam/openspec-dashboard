import React from 'react';
import { ChangeItem } from '../../types';

interface Props {
  changes: ChangeItem[];
  activeChange: string;
  setActiveChange: (id: string) => void;
  executeCommand: (cmd: string, args?: string[]) => void;
  agentProvider: string;
  onProviderChange: (provider: string) => void;
  onNewChangeClick?: () => void;
}

export const CommandCenter: React.FC<Props> = ({ 
  changes, 
  activeChange, 
  setActiveChange, 
  executeCommand,
  agentProvider,
  onProviderChange,
  onNewChangeClick
}) => {
  return (
    <div className="left-pane">
      <div className="pane-header">Changes</div>
      <div className="nav-group">
        <div className={`nav-item ${activeChange === 'main' ? 'active' : ''}`} onClick={() => setActiveChange('main')} id="nav-item-main">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          main
        </div>
        {changes.map(change => (
          <div 
            key={change.id} 
            className={`nav-item ${activeChange === change.id ? 'active' : ''}`} 
            onClick={() => setActiveChange(change.id)}
            id={`nav-item-${change.id}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{change.title} {activeChange === change.id ? '(Active)' : ''}</span>
            </div>
            <span style={{
              fontSize: '9px',
              fontWeight: 'bold',
              padding: '1px 5px',
              borderRadius: '3px',
              flexShrink: 0,
              background: change.framework === 'bmad' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
              color: change.framework === 'bmad' ? '#a855f7' : '#3b82f6',
              border: `1px solid ${change.framework === 'bmad' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
            }}>
              {change.framework === 'bmad' ? 'BMAD' : 'OPENSPEC'}
            </span>
          </div>
        ))}
      </div>

      <div className="pane-header" style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', borderBottom: 'none' }}>Agent Configuration</div>
      <div style={{ padding: '0 12px 12px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>AGENT PROVIDER</label>
        <select 
          value={agentProvider} 
          onChange={(e) => onProviderChange(e.target.value)}
          disabled={activeChange === 'main'}
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            padding: '6px 8px',
            borderRadius: '4px',
            fontSize: '13px',
            width: '100%',
            cursor: activeChange === 'main' ? 'not-allowed' : 'pointer'
          }}
          id="select-agent-provider"
        >
          <option value="antigravity">Anti-Gravity</option>
          <option value="claude">Claude Code</option>
          <option value="codex">Codex</option>
        </select>
      </div>

      <div className="pane-header" style={{ borderTop: '1px solid var(--border-color)', borderBottom: 'none' }}>Lifecycle Actions</div>
      <button 
        className="lifecycle-btn" 
        style={{ border: '1px dashed var(--accent-color)' }}
        onClick={() => {
          if (onNewChangeClick) {
            onNewChangeClick();
          } else {
            const name = window.prompt('Enter new change name (e.g. my-new-feature):');
            if (name) executeCommand('opsx-new', [name]);
          }
        }} 
        id="btn-opsx-new"
      >
        + New Change (opsx-new)
      </button>
      <button className="lifecycle-btn primary" onClick={() => executeCommand('opsx-continue')} id="btn-opsx-continue">▶ Continue (opsx-continue)</button>
      <button className="lifecycle-btn" onClick={() => executeCommand('opsx-verify')} id="btn-opsx-verify">Verify Specs (opsx-verify)</button>
      <button className="lifecycle-btn" onClick={() => executeCommand('opsx-sync')} id="btn-opsx-sync">Sync Specs (opsx-sync)</button>
    </div>
  );
};
