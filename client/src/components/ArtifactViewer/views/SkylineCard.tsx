import React, { useMemo } from 'react';
import { Artifacts } from '../../../types';

interface Props {
  artifacts: Artifacts;
  activeChange: string;
  onSwitchView?: (view: 'dashboard' | 'matrix' | 'raw' | 'diagram') => void;
  onWalkPillar?: (pillarId: string) => void;
}

export interface SkylinePillar {
  id: string;
  icon: string;
  title: string;
  summary: string;
}

/**
 * Level 1: The Grandma Standard
 * Explains the feature in plain, self-explained human terms—zero buzzwords!
 */
function extractPlainEnglishIntent(proposalText: string | undefined): string {
  if (!proposalText) return 'Upgrades application architecture and state management for active change.';

  // General dynamic extraction from proposal text
  const lines = proposalText.split('\n');
  const cleanLines = lines.filter((l) => {
    const trimmed = l.trim();
    return (
      trimmed.length > 0 &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('>') &&
      !trimmed.startsWith('|') &&
      !trimmed.toLowerCase().includes('bmad-architecture')
    );
  });

  for (const l of cleanLines) {
    let clean = l.trim().replace(/[*#`]/g, '');
    if (clean.length > 20 && clean.length < 250 && !clean.includes('http')) {
      return clean;
    }
  }

  return 'Upgrades application state persistence, architecture, and task workflow management.';
}

function extractCorePillars(artifacts: Artifacts): SkylinePillar[] {
  const combined = (artifacts.proposal || '') + '\n' + (artifacts.design || '') + '\n' + (artifacts.spec || '');

  // Dynamic extraction from Markdown Headings for general SDD projects
  const headers = combined
    .split('\n')
    .filter((l) => l.trim().startsWith('## ') || l.trim().startsWith('### '))
    .map((l) => l.replace(/^#+\s+/, '').trim())
    .filter((h) => h.length > 3 && !h.toLowerCase().includes('open question') && !h.toLowerCase().includes('verification') && !h.toLowerCase().includes('table of contents'));

  if (headers.length >= 1) {
    return headers.slice(0, 5).map((h, idx) => ({
      id: `shift-${idx + 1}`,
      icon: idx === 0 ? '🚀' : idx === 1 ? '🧠' : idx === 2 ? '🛡️' : idx === 3 ? '🔒' : '📦',
      title: h,
      summary: `Functional capability defined in SDD section: ${h}`,
    }));
  }

  // Fallback extraction for general OpenSpec changes
  return [
    { id: 'identity', icon: '🚀', title: 'User Workflow Extension', summary: 'Adds core functional capabilities to streamline user tasks.' },
    { id: 'spine', icon: '🧠', title: 'Persistent State Management', summary: 'Ensures application data is safely saved and restored across sessions.' },
    { id: 'jobs', icon: '🛡️', title: 'System Reliability & Validation', summary: 'Validates inputs and prevents unexpected errors during execution.' },
  ];
}

export const SkylineCard: React.FC<Props> = ({ artifacts, activeChange, onSwitchView, onWalkPillar }) => {
  const intent = useMemo(() => extractPlainEnglishIntent(artifacts.proposal), [artifacts.proposal]);
  const pillars = useMemo(() => extractCorePillars(artifacts), [artifacts]);

  const riskAnalysis = useMemo(() => {
    const combined = ((artifacts.proposal || '') + (artifacts.design || '') + (artifacts.spec || '')).toLowerCase();

    let level: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
    let reason = 'Modifies system architectural contracts, state handlers, and task execution boundaries.';

    if (combined.includes('schema') || combined.includes('migration') || combined.includes('table') || combined.includes('security') || combined.includes('auth')) {
      level = 'HIGH';
      reason = 'Updates security policies, persistent storage schemas, or critical authentication contracts.';
    }

    return { level, reason };
  }, [artifacts.proposal, artifacts.design, artifacts.spec]);

  const impactedFiles = useMemo(() => {
    const text = (artifacts.proposal || '') + '\n' + (artifacts.tasks || '') + '\n' + (artifacts.design || '');
    const fileMatches = text.match(/`([^`]+\.[a-z0-9]+)`/gi);
    if (!fileMatches) return ['Target repository source files'];
    const clean = Array.from(new Set(fileMatches.map((m) => m.replace(/`/g, ''))));
    return clean.slice(0, 5);
  }, [artifacts.proposal, artifacts.tasks, artifacts.design]);

  return (
    <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', backgroundColor: '#010409', overflowY: 'auto' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0d1117', padding: '16px 20px', borderRadius: '8px', border: '1px solid #30363d' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#58a6ff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Zoom Level 1 • Skyline Executive Summary (The Grandma Standard)
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

      {/* Main Grid: Intent & Pillars */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
        {/* Intent & Core Architectural Pillars */}
        <div style={{ backgroundColor: '#0d1117', padding: '20px', borderRadius: '8px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#58a6ff', marginBottom: '6px' }}>🎯 1-SENTENCE OVERVIEW</div>
            <div style={{ fontSize: '15px', color: '#f0f6fc', lineHeight: 1.5, fontWeight: 500, backgroundColor: '#161b22', padding: '12px 14px', borderRadius: '6px', borderLeft: '4px solid #388bfd' }}>
              "{intent}"
            </div>
          </div>

          <div style={{ borderTop: '1px solid #21262d', paddingTop: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🏛️ CORE FUNCTIONAL SHIFTS (NO BUZZWORDS)</span>
              <span style={{ fontSize: '11px', color: '#58a6ff' }}>Click any shift to Walk Subtree ➔</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {pillars.map((pillar, i) => (
                <div
                  key={pillar.id}
                  onClick={() => onWalkPillar?.(pillar.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    backgroundColor: '#161b22',
                    padding: '12px 14px',
                    borderRadius: '6px',
                    border: '1px solid #21262d',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#388bfd')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#21262d')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 'bold', color: '#f0f6fc' }}>
                      <span>{pillar.icon}</span>
                      <span style={{ color: '#79c0ff' }}>Shift #{i + 1}:</span>
                      <span>{pillar.title}</span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onWalkPillar?.(pillar.id);
                      }}
                      style={{
                        padding: '4px 10px',
                        backgroundColor: '#1f6feb22',
                        color: '#58a6ff',
                        border: '1px solid #388bfd88',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span>🔍 Walk Pillar #{i + 1}</span>
                      <span>➔</span>
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#c9d1d9', paddingLeft: '26px', lineHeight: '1.4' }}>
                    {pillar.summary}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Risk Spotlight & Touch Files */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ backgroundColor: '#0d1117', padding: '18px', borderRadius: '8px', border: '1px solid #30363d' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '8px' }}>🛡️ RISK SPOTLIGHT</div>
            <div style={{ fontSize: '13px', color: '#c9d1d9', lineHeight: 1.4 }}>
              {riskAnalysis.reason}
            </div>
          </div>

          <div style={{ backgroundColor: '#0d1117', padding: '18px', borderRadius: '8px', border: '1px solid #30363d', flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', marginBottom: '10px' }}>📄 TOUCHED CORE FILES</div>
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
          Ready for technical details? Zoom into Level 2 (Neighborhoods) for component choices.
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => onSwitchView?.('diagram')}
            style={{ padding: '8px 16px', backgroundColor: '#1f6feb', color: '#ffffff', border: '1px solid #388bfd', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            📐 Architecture Diagram (Idea 17)
          </button>
          <button
            onClick={() => onSwitchView?.('dashboard')}
            style={{ padding: '8px 16px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #363b42', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}
          >
            📊 Zoom to Neighborhoods (L2)
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
