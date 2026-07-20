import React, { useState } from 'react';
import { Artifacts, TaskItem } from '../types';

interface Props {
  artifacts: Artifacts;
  tasks: TaskItem[];
}

export const ArtifactViewer: React.FC<Props> = ({ artifacts, tasks }) => {
  const [activeTab, setActiveTab] = useState('Tasks');
  const [evalOverlay, setEvalOverlay] = useState(false);

  return (
    <div className="main-pane">
      <div className="tabs">
        {['Proposal', 'Specs', 'Design', 'Tasks'].map(tab => (
          <div 
            key={tab} 
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
            id={`tab-${tab.toLowerCase()}`}
          >
            {tab}
          </div>
        ))}
      </div>
      <div className="artifact-content markdown-preview" id="artifact-content">
        {activeTab === 'Tasks' && (
          <pre>{artifacts.tasks || 'No tasks found.'}</pre>
        )}
        {activeTab === 'Proposal' && <pre>{artifacts.proposal}</pre>}
        {activeTab === 'Specs' && <pre>{artifacts.spec}</pre>}
        {activeTab === 'Design' && <pre>{artifacts.design}</pre>}
      </div>
    </div>
  );
};
