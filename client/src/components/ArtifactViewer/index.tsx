import React, { useState } from 'react';
import { Artifacts, TaskItem } from '../../types';
import { SkylineCard } from './views/SkylineCard';
import { RawView } from './views/RawView';
import { MatrixView } from './views/MatrixView';
import { DashboardView } from './views/DashboardView';
import { WizardView } from './views/WizardView';
import { KeystoneView } from './views/KeystoneView';

interface Props {
  artifacts: Artifacts;
  tasks: TaskItem[];
  files: string[];
  activeChange: string;
  repoPath: string;
}

export const ArtifactViewer: React.FC<Props> = ({ artifacts, tasks: _tasks, files, activeChange, repoPath }) => {
  const [viewMode, setViewMode] = useState<'skyline' | 'raw' | 'matrix' | 'dashboard' | 'wizard' | 'keystone'>('skyline');

  const renderView = () => {
    switch (viewMode) {
      case 'skyline':
        return <SkylineCard artifacts={artifacts} activeChange={activeChange} onSwitchView={v => setViewMode(v)} />;
      case 'matrix':
        return <MatrixView artifacts={artifacts} />;
      case 'dashboard':
        return <DashboardView artifacts={artifacts} />;
      case 'wizard':
        return <WizardView artifacts={artifacts} />;
      case 'keystone':
        return <KeystoneView repoPath={repoPath} />;
      case 'raw':
      default:
        return <RawView artifacts={artifacts} activeChange={activeChange} />;
    }
  };

  return (
    <div className="main-pane">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', backgroundColor: '#0d1117', borderBottom: '1px solid #30363d' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#8b949e' }}>Artifact Viewer</div>
        <div style={{ display: 'flex', gap: '5px' }}>
          {[
            { id: 'skyline', icon: '⚡', label: 'Skyline (L1)' },
            { id: 'dashboard', icon: '📊', label: 'Neighborhoods (L2)' },
            { id: 'matrix', icon: '🌳', label: 'Matrix (L3)' },
            { id: 'raw', icon: '📝', label: 'Raw Diffs (L4)' },
            { id: 'wizard', icon: '🧙‍♂️', label: 'Wizard' },
            { id: 'keystone', icon: '🧩', label: 'Artifacts (Keystone)' }
          ].map(v => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id as any)}
              style={{
                padding: '4px 10px',
                backgroundColor: viewMode === v.id ? '#1f6feb' : 'transparent',
                color: viewMode === v.id ? 'white' : '#c9d1d9',
                border: '1px solid',
                borderColor: viewMode === v.id ? '#388bfd' : '#30363d',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span>{v.icon}</span> {v.label}
            </button>
          ))}
        </div>
      </div>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* We only show the file explorer in raw view to save horizontal space in others */}
        {viewMode === 'raw' && (
          <div className="file-explorer">
            <div className="file-explorer-header">GENERATED FILES</div>
            {files.length === 0 && <div className="file-explorer-empty">No files yet...</div>}
            {files.map(f => (
              <div key={f} className="file-item">
                📄 {f}
              </div>
            ))}
          </div>
        )}
        
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', backgroundColor: '#010409' }}>
          {renderView()}
        </div>
      </div>
    </div>
  );
};

