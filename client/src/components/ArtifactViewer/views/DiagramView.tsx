import React, { useMemo, useState } from 'react';
import { Artifacts } from '../../../types';
import './DiagramView.css';

interface Props {
  artifacts: Artifacts;
}

export interface ArchComponentNode {
  id: string;
  name: string;
  layer: 'Presentation & UI Layer' | 'Orchestration & API Layer' | 'Core Domain & Engine Layer' | 'Data & Storage Layer';
  type: 'component' | 'service' | 'storage' | 'gateway' | 'adapter';
  description: string;
  statusBadge: 'NEW' | 'MODIFIED' | 'UNCHANGED';
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  linkedSpecs: string[];
  linkedTasks: string[];
  designRationale?: string;
  dependencies: string[];
}

export const DiagramView: React.FC<Props> = ({ artifacts }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'canvas' | 'mermaid'>('canvas');
  const [copiedMermaid, setCopiedMermaid] = useState(false);

  // Extract architectural components dynamically from design.md & proposal.md & linkages
  const { components, mermaidSource } = useMemo(() => {
    const parsedComponents: ArchComponentNode[] = [];
    const designText = artifacts.design || '';
    const proposalText = artifacts.proposal || '';
    const specText = artifacts.spec || '';
    const tasksText = artifacts.tasks || '';

    // 1. Try to extract inline Mermaid block if present
    const mermaidMatch = designText.match(/```mermaid([\s\S]*?)```/i) || proposalText.match(/```mermaid([\s\S]*?)```/i);
    let extractedMermaid = mermaidMatch ? mermaidMatch[1].trim() : '';

    // Parse design decisions or sections to infer architecture components
    const lines = (designText + '\n' + proposalText + '\n' + specText).split('\n');
    let currentCategory = '';

    lines.forEach((line) => {
      if (line.startsWith('#') || line.startsWith('##')) {
        currentCategory = line.replace(/#/g, '').trim();
      }

      const decMatch = line.match(/(?:Decision|Component|Module|Layer|Service|Storage|Adapter|Interface)\s*[:—–-]\s*(.+)/i) ||
                       line.match(/^###\s+(.+)$/i);

      if (decMatch) {
        const title = decMatch[1].trim();
        if (title.length > 3 && title.length < 60 && !parsedComponents.some(c => c.name.toLowerCase() === title.toLowerCase())) {
          let layer: ArchComponentNode['layer'] = 'Core Domain & Engine Layer';
          let type: ArchComponentNode['type'] = 'service';

          const lowTitle = title.toLowerCase();
          if (lowTitle.includes('ui') || lowTitle.includes('client') || lowTitle.includes('view') || lowTitle.includes('dashboard') || lowTitle.includes('frontend')) {
            layer = 'Presentation & UI Layer';
            type = 'component';
          } else if (lowTitle.includes('api') || lowTitle.includes('gateway') || lowTitle.includes('router') || lowTitle.includes('socket') || lowTitle.includes('adapter')) {
            layer = 'Orchestration & API Layer';
            type = lowTitle.includes('adapter') ? 'adapter' : 'gateway';
          } else if (lowTitle.includes('store') || lowTitle.includes('db') || lowTitle.includes('persist') || lowTitle.includes('token') || lowTitle.includes('cache') || lowTitle.includes('storage')) {
            layer = 'Data & Storage Layer';
            type = 'storage';
          }

          parsedComponents.push({
            id: `node-${parsedComponents.length + 1}`,
            name: title,
            layer,
            type,
            description: `Architectural component derived from ${currentCategory || 'design specs'}.`,
            statusBadge: lowTitle.includes('new') || lowTitle.includes('add') ? 'NEW' : 'MODIFIED',
            riskLevel: lowTitle.includes('security') || lowTitle.includes('token') || lowTitle.includes('auth') || lowTitle.includes('persistence') ? 'HIGH' : 'MEDIUM',
            linkedSpecs: lines.filter(l => l.includes(title) || (l.startsWith('-') && l.toLowerCase().includes(lowTitle.slice(0, 5)))).slice(0, 3),
            linkedTasks: tasksText.split('\n').filter(t => t.includes('- [') && t.toLowerCase().includes(lowTitle.slice(0, 5))).slice(0, 3),
            dependencies: []
          });
        }
      }
    });

    // Fallback default architectural nodes if parsing yields < 3 items
    if (parsedComponents.length < 3) {
      parsedComponents.push(
        {
          id: 'comp-ui',
          name: 'OpenSpec Dashboard UI & ArtifactViewer',
          layer: 'Presentation & UI Layer',
          type: 'component',
          description: 'Renders Zoom Levels 1-4, Skyline cards, and interactive architecture views.',
          statusBadge: 'MODIFIED',
          riskLevel: 'LOW',
          linkedSpecs: ['Skyline progressive disclosure requirement', 'ArtifactViewer view routing contract'],
          linkedTasks: ['Add DiagramView architecture component', 'Wire navigation tab'],
          designRationale: 'Keeps UI decoupled and responsive using vanilla CSS and modular views.',
          dependencies: ['comp-api']
        },
        {
          id: 'comp-api',
          name: 'SDD Framework Adapter & Repo Service',
          layer: 'Orchestration & API Layer',
          type: 'adapter',
          description: 'Auto-detects OpenSpec & BMAD frameworks, parses proposal/spec/design/linkages.',
          statusBadge: 'MODIFIED',
          riskLevel: 'MEDIUM',
          linkedSpecs: ['Multi-SDD framework parsing specification', 'Linkage graph extraction requirement'],
          linkedTasks: ['Support BMAD single-story artifact parsing'],
          designRationale: 'Normalizes disparate SDD structures into canonical OpenSpec schema.',
          dependencies: ['comp-storage']
        },
        {
          id: 'comp-storage',
          name: 'Workspace & State Storage',
          layer: 'Data & Storage Layer',
          type: 'storage',
          description: 'Persists context skyline, walk of pain ledger, and active change artifacts.',
          statusBadge: 'UNCHANGED',
          riskLevel: 'HIGH',
          linkedSpecs: ['Session boot persistence contract', 'Traceability linkage JSON integrity'],
          linkedTasks: ['Log session completions to context skyline'],
          designRationale: 'Uses low-overhead JSON indexes for sub-millisecond agent boot.',
          dependencies: []
        }
      );
    }

    // Auto-generate Mermaid syntax if non-existent
    if (!extractedMermaid) {
      const mermaidLines = ['graph TD'];
      mermaidLines.push('  subgraph Presentation["Presentation & UI Layer"]');
      parsedComponents.filter(c => c.layer === 'Presentation & UI Layer').forEach(c => {
        mermaidLines.push(`    ${c.id}["${c.name}"]`);
      });
      mermaidLines.push('  end\n');

      mermaidLines.push('  subgraph Orchestration["Orchestration & API Layer"]');
      parsedComponents.filter(c => c.layer === 'Orchestration & API Layer').forEach(c => {
        mermaidLines.push(`    ${c.id}["${c.name}"]`);
      });
      mermaidLines.push('  end\n');

      mermaidLines.push('  subgraph Core["Core Domain & Engine Layer"]');
      parsedComponents.filter(c => c.layer === 'Core Domain & Engine Layer').forEach(c => {
        mermaidLines.push(`    ${c.id}["${c.name}"]`);
      });
      mermaidLines.push('  end\n');

      mermaidLines.push('  subgraph Data["Data & Storage Layer"]');
      parsedComponents.filter(c => c.layer === 'Data & Storage Layer').forEach(c => {
        mermaidLines.push(`    ${c.id}["${c.name}"]`);
      });
      mermaidLines.push('  end\n');

      // Link layers
      mermaidLines.push('  Presentation --> Orchestration');
      mermaidLines.push('  Orchestration --> Core');
      mermaidLines.push('  Core --> Data');

      extractedMermaid = mermaidLines.join('\n');
    }

    return { components: parsedComponents, mermaidSource: extractedMermaid };
  }, [artifacts]);

  const layers: ArchComponentNode['layer'][] = [
    'Presentation & UI Layer',
    'Orchestration & API Layer',
    'Core Domain & Engine Layer',
    'Data & Storage Layer'
  ];

  const selectedNode = components.find(c => c.id === selectedNodeId);

  const handleCopyMermaid = () => {
    navigator.clipboard.writeText(mermaidSource);
    setCopiedMermaid(true);
    setTimeout(() => setCopiedMermaid(false), 2000);
  };

  return (
    <div className="diagram-container">
      <div className="diagram-header">
        <div className="diagram-title-group">
          <h3 className="diagram-title">
            <span>📐</span> Architecture Topology & Diagram Builder
          </h3>
          <span className="diagram-badge">Idea 17 Active</span>
        </div>
        <div className="diagram-controls">
          <button
            className={`diagram-btn ${viewMode === 'canvas' ? 'active' : ''}`}
            onClick={() => setViewMode('canvas')}
          >
            <span>🎨</span> Visual Canvas
          </button>
          <button
            className={`diagram-btn ${viewMode === 'mermaid' ? 'active' : ''}`}
            onClick={() => setViewMode('mermaid')}
          >
            <span>💻</span> Mermaid Source
          </button>
        </div>
      </div>

      <div className="diagram-body">
        {viewMode === 'canvas' ? (
          <>
            <div className="diagram-canvas">
              {layers.map(layerName => {
                const layerNodes = components.filter(c => c.layer === layerName);
                if (layerNodes.length === 0) return null;

                return (
                  <div key={layerName} className="diagram-layer">
                    <div className="diagram-layer-header">
                      <span className="diagram-layer-title">
                        <span>🏛️</span> {layerName}
                      </span>
                      <span style={{ fontSize: '11px', color: '#8b949e' }}>
                        {layerNodes.length} {layerNodes.length === 1 ? 'component' : 'components'}
                      </span>
                    </div>

                    <div className="diagram-nodes-grid">
                      {layerNodes.map(node => {
                        const isSelected = node.id === selectedNodeId;
                        return (
                          <div
                            key={node.id}
                            className={`diagram-node-card ${isSelected ? 'selected' : ''}`}
                            onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                          >
                            <div className="diagram-node-header">
                              <span className="diagram-node-name">{node.name}</span>
                              <span className="diagram-node-type-pill">{node.type}</span>
                            </div>

                            <div className="diagram-node-desc">{node.description}</div>

                            <div className="diagram-node-footer">
                              <span style={{
                                color: node.statusBadge === 'NEW' ? '#3fb950' : '#e3b341',
                                fontWeight: 700
                              }}>
                                ● {node.statusBadge}
                              </span>
                              <span className="diagram-node-links-count">
                                🔗 {node.linkedSpecs.length + node.linkedTasks.length} linked items
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedNode && (
              <div className="diagram-inspector-drawer">
                <div className="diagram-inspector-header">
                  <div className="diagram-inspector-title">
                    <span>🔍</span> Node Detail Inspector
                  </div>
                  <button className="diagram-close-btn" onClick={() => setSelectedNodeId(null)}>✕</button>
                </div>

                <div className="diagram-section">
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#f0f6fc' }}>{selectedNode.name}</div>
                  <div style={{ fontSize: '12px', color: '#8b949e' }}>Layer: {selectedNode.layer}</div>
                </div>

                <div className="diagram-section">
                  <div className="diagram-section-title">Overview & Purpose</div>
                  <div className="diagram-spec-item">{selectedNode.description}</div>
                </div>

                {selectedNode.designRationale && (
                  <div className="diagram-section">
                    <div className="diagram-section-title">💡 Design Rationale</div>
                    <div className="diagram-spec-item" style={{ borderLeft: '3px solid #e3b341' }}>
                      {selectedNode.designRationale}
                    </div>
                  </div>
                )}

                <div className="diagram-section">
                  <div className="diagram-section-title">📜 Linked Specifications ({selectedNode.linkedSpecs.length})</div>
                  {selectedNode.linkedSpecs.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#8b949e', fontStyle: 'italic' }}>No linked specs found.</div>
                  ) : (
                    selectedNode.linkedSpecs.map((spec, idx) => (
                      <div key={idx} className="diagram-spec-item">
                        {spec}
                      </div>
                    ))
                  )}
                </div>

                <div className="diagram-section">
                  <div className="diagram-section-title">✅ Execution Tasks ({selectedNode.linkedTasks.length})</div>
                  {selectedNode.linkedTasks.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#8b949e', fontStyle: 'italic' }}>No linked tasks found.</div>
                  ) : (
                    selectedNode.linkedTasks.map((task, idx) => (
                      <div key={idx} className="diagram-spec-item">
                        {task}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="diagram-mermaid-drawer">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#8b949e' }}>
                Mermaid Diagram Markup (Synced with System Specs)
              </span>
              <button className="diagram-btn" onClick={handleCopyMermaid}>
                {copiedMermaid ? '✓ Copied!' : '📋 Copy Mermaid Code'}
              </button>
            </div>
            <pre className="diagram-code-box">{mermaidSource}</pre>
          </div>
        )}
      </div>
    </div>
  );
};
