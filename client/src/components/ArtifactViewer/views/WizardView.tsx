import React, { useState } from 'react';
import { Artifacts } from '../../../types';

interface Props {
  artifacts: Artifacts;
}

const STEPS = [
  { id: 'proposal', label: '1. Proposal', title: 'Verify Goals & Requirements' },
  { id: 'spec', label: '2. Specifications', title: 'Verify Functional Specs' },
  { id: 'design', label: '3. Technical Design', title: 'Verify Architectural Design' },
  { id: 'tasks', label: '4. Action Plan', title: 'Verify Execution Tasks' }
];

export const WizardView: React.FC<Props> = ({ artifacts }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

  const step = STEPS[currentStepIndex];
  const artifactContent = artifacts[step.id as 'proposal' | 'spec' | 'design' | 'tasks'] || `No ${step.id} generated yet.`;

  return (
    <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px', gap: '10px' }}>
        {STEPS.map((s, i) => (
          <div 
            key={s.id}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              backgroundColor: i === currentStepIndex ? '#1f6feb' : (i < currentStepIndex ? '#238636' : '#161b22'),
              color: i <= currentStepIndex ? 'white' : '#8b949e',
              border: '1px solid',
              borderColor: i === currentStepIndex ? '#388bfd' : (i < currentStepIndex ? '#2ea043' : '#30363d'),
              fontSize: '13px',
              fontWeight: 'bold'
            }}
          >
            {i < currentStepIndex ? '✓ ' : ''}{s.label}
          </div>
        ))}
      </div>
      
      <div style={{ backgroundColor: '#0d1117', border: '1px solid #30363d', borderRadius: '8px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #30363d', backgroundColor: '#161b22' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>{step.title}</h2>
          <p style={{ margin: '5px 0 0 0', color: '#8b949e', fontSize: '13px' }}>Please review and accept this section before proceeding to the next.</p>
        </div>
        
        <div className="markdown-preview" style={{ flex: 1, overflowY: 'auto', padding: '30px' }}>
          <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: 0, fontFamily: 'inherit' }}>
            {artifactContent}
          </pre>
        </div>
        
        <div style={{ padding: '20px', borderTop: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <button 
              disabled={currentStepIndex === 0}
              onClick={() => setCurrentStepIndex(i => i - 1)}
              style={{ padding: '10px 20px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: '6px', cursor: currentStepIndex === 0 ? 'not-allowed' : 'pointer' }}
            >
              ← Back
            </button>
          </div>
          <div style={{ display: 'flex', gap: '15px' }}>
            <button 
              disabled={currentStepIndex === STEPS.length - 1}
              onClick={() => setCurrentStepIndex(i => i + 1)}
              style={{ padding: '10px 20px', backgroundColor: '#238636', color: 'white', border: '1px solid rgba(240, 246, 252, 0.1)', borderRadius: '6px', cursor: currentStepIndex === STEPS.length - 1 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
            >
              Accept & Continue →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
