import React, { useState, useMemo } from 'react';
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

// Fallback categorization logic to ensure 100% resilient item grouping
function getItemCategory(c: ChangeItem): 'planning' | 'epic' | 'story' | 'openspec' {
  if (c.category) return c.category;
  if (c.id === 'main' || c.framework === 'openspec') return 'openspec';
  
  const lowTitle = c.title.toLowerCase();
  const lowId = c.id.toLowerCase();
  
  if (lowTitle.startsWith('story') || /^\d+[-._]\d+/.test(lowId) || /^story\s+\d+/i.test(lowTitle)) {
    return 'story';
  }
  if (lowId.includes('epic') || lowTitle.includes('epic') || lowId.includes('sprint') || lowTitle.includes('sprint')) {
    return 'epic';
  }
  return 'planning';
}

function getItemEpicNumber(c: ChangeItem): number | undefined {
  if (c.epicNumber !== undefined) return c.epicNumber;
  
  const match = c.id.match(/^(\d+)[-._](\d+)/) || c.title.match(/Story\s*(\d+)[-._\s]+(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  const epicMatch = c.id.match(/epic[-_]?(\d+)/i) || c.title.match(/Epic\s*(\d+)/i);
  if (epicMatch) {
    return parseInt(epicMatch[1], 10);
  }
  return undefined;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | 'openspec' | 'planning' | 'epic' | 'story'>('all');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    openspec: true,
    planning: true,
    epics: true,
    stories: true,
  });
  const [expandedEpics, setExpandedEpics] = useState<Record<number, boolean>>({});

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleEpicFolder = (epicNum: number) => {
    setExpandedEpics(prev => ({ ...prev, [epicNum]: !prev[epicNum] }));
  };

  // Process and enrich change items with reliable category and epicNumber
  const enrichedChanges = useMemo(() => {
    return changes.map(c => ({
      ...c,
      category: getItemCategory(c),
      epicNumber: getItemEpicNumber(c),
    }));
  }, [changes]);

  // Filter items based on search query and category filter
  const filteredChanges = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return enrichedChanges.filter(c => {
      const matchesSearch = !query || c.title.toLowerCase().includes(query) || c.id.toLowerCase().includes(query);
      const matchesCategory = activeCategoryFilter === 'all' || c.category === activeCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [enrichedChanges, searchQuery, activeCategoryFilter]);

  // Group items into categories
  const openspecItems = useMemo(() => filteredChanges.filter(c => c.category === 'openspec'), [filteredChanges]);
  const planningItems = useMemo(() => filteredChanges.filter(c => c.category === 'planning'), [filteredChanges]);
  const epicItems = useMemo(() => filteredChanges.filter(c => c.category === 'epic'), [filteredChanges]);
  const storyItems = useMemo(() => filteredChanges.filter(c => c.category === 'story'), [filteredChanges]);

  // Group stories by Epic Number
  const storiesByEpic = useMemo(() => {
    const map = new Map<number, ChangeItem[]>();
    const ungrouped: ChangeItem[] = [];

    storyItems.forEach(item => {
      if (item.epicNumber !== undefined) {
        if (!map.has(item.epicNumber)) map.set(item.epicNumber, []);
        map.get(item.epicNumber)!.push(item);
      } else {
        ungrouped.push(item);
      }
    });

    const sortedEpics = Array.from(map.keys()).sort((a, b) => a - b);
    return { map, sortedEpics, ungrouped };
  }, [storyItems]);

  const renderItemCard = (change: ChangeItem) => {
    const isActive = activeChange === change.id;
    return (
      <div 
        key={change.id} 
        className={`nav-item ${isActive ? 'active' : ''}`} 
        onClick={() => setActiveChange(change.id)}
        id={`nav-item-${change.id}`}
        title={change.title}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          fontSize: '12.5px',
          borderRadius: '5px',
          marginBottom: '3px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          borderLeft: isActive ? '3px solid #388bfd' : '3px solid transparent',
          backgroundColor: isActive ? 'rgba(56, 139, 253, 0.15)' : 'transparent'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', minWidth: 0 }}>
          <span style={{ fontSize: '11px', flexShrink: 0 }}>
            {change.category === 'planning' ? '📌' : change.category === 'epic' ? '📦' : change.category === 'story' ? '📄' : '⚡'}
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}>
            {change.title}
          </span>
        </div>
        <span style={{
          fontSize: '9px',
          fontWeight: 'bold',
          padding: '1px 5px',
          borderRadius: '3px',
          flexShrink: 0,
          background: change.framework === 'bmad' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          color: change.framework === 'bmad' ? '#c084fc' : '#60a5fa',
          border: `1px solid ${change.framework === 'bmad' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
        }}>
          {change.framework === 'bmad' ? 'BMAD' : 'SPEC'}
        </span>
      </div>
    );
  };

  return (
    <div className="left-pane" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Changes Navigator</span>
        <span style={{ fontSize: '11px', color: '#8b949e', fontWeight: 'bold' }}>{changes.length} Items</span>
      </div>

      {/* Search Input */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)', backgroundColor: '#0d1117' }}>
        <input
          type="text"
          placeholder="🔍 Filter stories & epics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            color: '#c9d1d9',
            padding: '5px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            outline: 'none'
          }}
        />
      </div>

      {/* Category Pills */}
      <div style={{ display: 'flex', gap: '4px', padding: '6px 10px', borderBottom: '1px solid var(--border-color)', backgroundColor: '#0d1117', overflowX: 'auto' }}>
        {[
          { id: 'all', label: `All (${enrichedChanges.length})` },
          { id: 'openspec', label: `⚡ Spec (${openspecItems.length})` },
          { id: 'planning', label: `📌 Plan (${planningItems.length})` },
          { id: 'epic', label: `📦 Epics (${epicItems.length})` },
          { id: 'story', label: `📄 Stories (${storyItems.length})` },
        ].map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategoryFilter(cat.id as any)}
            style={{
              padding: '2px 7px',
              fontSize: '10.5px',
              fontWeight: 600,
              borderRadius: '10px',
              border: '1px solid',
              borderColor: activeCategoryFilter === cat.id ? '#388bfd' : '#30363d',
              backgroundColor: activeCategoryFilter === cat.id ? '#1f6feb22' : '#161b22',
              color: activeCategoryFilter === cat.id ? '#58a6ff' : '#8b949e',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Scrollable Nav List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {/* Section 0: OpenSpec / Main Changes */}
        {openspecItems.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div 
              onClick={() => toggleSection('openspec')}
              style={{
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#8b949e',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none'
              }}
            >
              <span>{expandedSections.openspec ? '▼' : '▶'} ⚡ Active Changes ({openspecItems.length})</span>
            </div>
            {expandedSections.openspec && (
              <div style={{ marginTop: '4px' }}>
                {openspecItems.map(renderItemCard)}
              </div>
            )}
          </div>
        )}

        {/* Section 1: Planning & Architecture */}
        {planningItems.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div 
              onClick={() => toggleSection('planning')}
              style={{
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#8b949e',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none'
              }}
            >
              <span>{expandedSections.planning ? '▼' : '▶'} 📌 Planning Stage ({planningItems.length})</span>
            </div>
            {expandedSections.planning && (
              <div style={{ marginTop: '4px' }}>
                {planningItems.map(renderItemCard)}
              </div>
            )}
          </div>
        )}

        {/* Section 2: Epics */}
        {epicItems.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div 
              onClick={() => toggleSection('epics')}
              style={{
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#8b949e',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none'
              }}
            >
              <span>{expandedSections.epics ? '▼' : '▶'} 📦 Epics & Sprints ({epicItems.length})</span>
            </div>
            {expandedSections.epics && (
              <div style={{ marginTop: '4px' }}>
                {epicItems.map(renderItemCard)}
              </div>
            )}
          </div>
        )}

        {/* Section 3: Stories Grouped by Epic */}
        {storyItems.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div 
              onClick={() => toggleSection('stories')}
              style={{
                fontSize: '11px',
                fontWeight: 'bold',
                color: '#8b949e',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                userSelect: 'none'
              }}
            >
              <span>{expandedSections.stories ? '▼' : '▶'} 📄 Stories ({storyItems.length})</span>
            </div>

            {expandedSections.stories && (
              <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {storiesByEpic.sortedEpics.map(epicNum => {
                  const epicStories = storiesByEpic.map.get(epicNum)!;
                  const isEpicOpen = expandedEpics[epicNum] ?? (searchQuery.length > 0 || epicStories.some(s => s.id === activeChange));

                  return (
                    <div key={epicNum} style={{ backgroundColor: '#0d1117', border: '1px solid #21262d', borderRadius: '6px', overflow: 'hidden' }}>
                      <div 
                        onClick={() => toggleEpicFolder(epicNum)}
                        style={{
                          padding: '5px 8px',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          color: '#c9d1d9',
                          backgroundColor: '#161b22',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          userSelect: 'none'
                        }}
                      >
                        <span>{isEpicOpen ? '📂' : '📁'} Epic {epicNum} ({epicStories.length})</span>
                        <span style={{ fontSize: '10px', color: '#8b949e' }}>{isEpicOpen ? '▲' : '▼'}</span>
                      </div>
                      {isEpicOpen && (
                        <div style={{ padding: '4px 6px' }}>
                          {epicStories.map(renderItemCard)}
                        </div>
                      )}
                    </div>
                  );
                })}

                {storiesByEpic.ungrouped.length > 0 && (
                  <div style={{ padding: '4px 6px' }}>
                    {storiesByEpic.ungrouped.map(renderItemCard)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Agent Configuration Footer */}
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
        style={{ border: '1px dashed var(--accent-color)', margin: '8px 12px' }}
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
    </div>
  );
};
