import React, { useMemo } from 'react';
import { Artifacts } from '../../../types';

interface Props {
  artifacts: Artifacts;
  activeChange: string;
  onSwitchView?: (view: 'dashboard' | 'matrix' | 'raw') => void;
}

export const SkylineCard: React.FC<Props> = ({ artifacts, activeChange, onSwitchView }) => {
  // Extract 1-sentence intent from proposal
  const intent = useMemo(() => {
    if (!artifacts.proposal) return 'No proposal text provided for this change.';
    const lines = artifacts.proposal.split('\n');
    const whyIdx = lines.findIndex(l => l.toLowerCase().includes('## why'));
    if (whyIdx !== -1) {
      const paragraphs = lines.slice(whyIdx + 1).filter(l => l.trim().length > 0 && !l.startsWith('#'));
      if (paragraphs.length > 0) return paragraphs[0].trim();
    }
    const cleanLines = lines.filter(l => l.trim() && !l.startsWith('#'));
    return cleanLines[0] || 'Integrate new change capabilities.';
  }, [artifacts.proposal]);

  // Extract 3 core technical pillars from proposal or design
  const pillars = useMemo(() => {
    if (!artifacts.proposal && !artifacts.design) return ['Feature Scope Implementation'];
    const text = (artifacts.proposal || '') + '\n' + (artifacts.design || '');
    const bullets = text
      .split('\n')
      .filter(l => l.trim().startsWith('- ') || l.trim().startsWith('* '))
      .map(l => l.trim().replace(/^[-*]\s*/, '').replace(/\*\*|\*/g, '').trim())
      .filter(b => b.length > 10);
    return Array.from(new Set(bullets)).slice(0, 3);
  }, [artifacts.proposal, artifacts.design]);

  // Calculate Risk Index based on proposal and design keywords
  const riskAnalysis = useMemo(() => {
    const combined = ((artifacts.proposal || '') + (artifacts.design || '') + (artifacts.spec || '')).toLowerCase();
    
    let level: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let reason = 'Standard UI / Provider extension; 0 DB schema mutations.';

    if (combined.includes('schema') || combined.includes('migration') || combined.includes('table') || combined.includes('security') || combined.includes('auth')) {
      level = 'HIGH';
      reason = 'Modifies core database schemas, security parameters, or system persistence contracts.';
    } else if (combined.includes('interface') || combined.includes('refactor') || combined.includes('api') || combined.includes('backend')) {
      level = 'MEDIUM';
      reason = 'Extends backend service APIs or core provider contracts.';
    }

    return { level, reason };
  }, [artifacts.proposal, artifacts.design, artifacts.spec]);

  // Extract impacted files list
  const impactedFiles = useMemo(() => {
    const text = (artifacts.proposal || '') + '\n' + (artifacts.tasks || '');
    const fileMatches = text.match(/`([^`]+\.[a-z0-9]+)`/gi);
    if (!fileMatches) return ['Component & Provider Registry Files'];
    const clean = Array.from(new Set(fileMatches.map(m => m.replace(/`/g, ''))));
    return clean.slice(0, 5);
  }, [artifacts.proposal, artifacts.tasks]);

  return (
    <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: '#010409', overflowY: 'auto' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0d1117', padding: '16px 20px', borderRadius: '8px', border: '1px solid #30363d' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#58a6ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Zoom Level 1 • Skyline Summary
          </div>
          <h2 style={{ margin: '4px 0 0 0', fontSize: '20px', color: '#c9d1d9' }}>
            {activeChange || 'Active Change'}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{
            backgroundColor: riskAnalysis.level === 'HIGH' ? '#490202' : riskAnalysis.level === 'MEDIUM' ? '#3d2503' : '#042713',
            color: riskAnalysis.level === 'HIGH' ? '#ff7b72' : riskAnalysis.level === 'MEDIUM' ? '#f2cc60' : '#7ee787',
            border: `1px solid ${riskAnalysis.level === 'HIGH' ? '#f85149' : riskAnalysis.level === 'MEDIUM' ? '#d29922' : '#238636'}`,
            padding: '4px 12px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 600
          }}>
            {riskAnalysis.level} RISK
          </span>
          <span style={{ backgroundColor: '#161b22', color: '#8b949e', border: '1px solid #30363d', padding: '4px 12px', borderRadius: '12px', fontSize: '12px' }}>
            ⚡ 5s Alignment Ready
          </span>
        </div>
      </div>

      {/* Main Grid: Intent & Risk */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Intent & Pillars Box */}
        <div style={{ backgroundColor: '#0d1117', padding: '20px', borderRadius: '8px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '6px' }}>🎯 1-SENTENCE INTENT</div>
            <div style={{ fontSize: '15px', color: '#f0f6fc', lineHeight: 1.5, fontWeight: 500 }}>
              "{intent}"
            </div>
          </div>

          <div style={{ borderTop: '1px solid #21262d', paddingTop: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '10px' }}>🏛️ 3 CORE TECHNICAL PILLARS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pillars.map((pillar, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#161b22', padding: '10px 14px', borderRadius: '6px', border: '1px solid #21262d', fontSize: '13px', color: '#c9d1d9' }}>
                  <span style={{ color: '#58a6ff', fontWeight: 'bold' }}>#{i + 1}</span>
                  <span>{pillar}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Risk Spotlight & Impacted Files */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ backgroundColor: '#0d1117', padding: '18px', borderRadius: '8px', border: '1px solid #30363d' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '8px' }}>🛡️ RISK SPOTLIGHT</div>
            <div style={{ fontSize: '13px', color: '#c9d1d9', lineHeight: 1.4 }}>
              {riskAnalysis.reason}
            </div>
          </div>

          <div style={{ backgroundColor: '#0d1117', padding: '18px', borderRadius: '8px', border: '1px solid #30363d', flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '10px' }}>📄 TOUCHED FILES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {impactedFiles.map((file, idx) => (
                <div key={idx} style={{ fontSize: '12px', fontFamily: 'monospace', color: '#a5d6ff', backgroundColor: '#161b22', padding: '4px 8px', borderRadius: '4px' }}>
                  {file}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div style={{ backgroundColor: '#0d1117', padding: '16px 20px', borderRadius: '8px', border: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', color: '#8b949e' }}>
          Need deeper context? Zoom into Level 2 (Neighborhoods) or Level 3 (Matrix).
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => onSwitchView?.('dashboard')}
            style={{ padding: '8px 16px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #363b42', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
          >
            📊 Zoom to Neighborhoods
          </button>
          <button
            onClick={() => onSwitchView?.('raw')}
            style={{ padding: '8px 16px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #363b42', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
          >
            📝 Forensic Raw Diffs (Level 4)
          </button>
          <button
            onClick={() => alert(`Approved High-Level Intent for ${activeChange}!`)}
            style={{ padding: '8px 18px', backgroundColor: '#238636', color: 'white', border: '1px solid #2ea043', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ⚡ 5-Sec Quick Approve
          </button>
        </div>
      </div>
    </div>
  );
};
