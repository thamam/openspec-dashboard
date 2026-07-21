import React from 'react';
import { ChangeItem } from '../../types';

interface Props {
  changes: ChangeItem[];
  activeChange: string;
  setActiveChange: (id: string) => void;
  executeCommand: (cmd: string, args?: string[]) => void;
}

export const CommandCenter: React.FC<Props> = ({ changes, activeChange, setActiveChange, executeCommand }) => {
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
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            {change.title} {activeChange === change.id ? '(Active)' : ''}
          </div>
        ))}
      </div>

      <div className="pane-header" style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', borderBottom: 'none' }}>Lifecycle Actions</div>
      <button 
        className="lifecycle-btn" 
        style={{ border: '1px dashed var(--accent-color)' }}
        onClick={() => {
          const name = window.prompt('Enter new change name (e.g. my-new-feature):');
          if (name) executeCommand('opsx-new', [name]);
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
