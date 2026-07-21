import React, { useMemo, useState } from 'react';
import { Artifacts, Linkage } from '../../../types';

interface Props {
  artifacts: Artifacts;
}

const extractBullets = (md: string) => {
  if (!md) return [];
  return md.split('\n')
    .filter(line => line.trim().startsWith('- ') || line.trim().startsWith('* '))
    .map(line => line.trim().substring(2).trim());
};

const getConnectedSet = (seed: string | null, linkages: Linkage[] = []) => {
  const connected = new Set<string>();
  if (!seed) return connected;

  const queue = [seed];
  connected.add(seed);

  const isMatch = (a: string, b: string) => {
    if (!a || !b || a.length < 5 || b.length < 5) return false;
    const lowA = a.toLowerCase();
    const lowB = b.toLowerCase();
    return lowA.includes(lowB) || lowB.includes(lowA);
  };

  while (queue.length > 0) {
    const curr = queue.shift()!;
    linkages.forEach(link => {
      if (isMatch(link.source, curr) && !Array.from(connected).some(c => isMatch(c, link.target))) {
        connected.add(link.target);
        queue.push(link.target);
      }
      if (isMatch(link.target, curr) && !Array.from(connected).some(c => isMatch(c, link.source))) {
        connected.add(link.source);
        queue.push(link.source);
      }
    });
  }
  return connected;
};

export const DashboardView: React.FC<Props> = ({ artifacts }) => {
  const proposalBullets = useMemo(() => extractBullets(artifacts.proposal), [artifacts.proposal]);
  const designBullets = useMemo(() => extractBullets(artifacts.design), [artifacts.design]);
  const tasksBullets = useMemo(() => extractBullets(artifacts.tasks), [artifacts.tasks]);

  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  
  const connectedSet = useMemo(() => 
    getConnectedSet(hoveredItem, artifacts.linkages), 
  [hoveredItem, artifacts.linkages]);

  const isHighlighted = (item: string) => {
    if (!hoveredItem) return false; // Default: nothing highlighted if no hover
    return Array.from(connectedSet).some(c => {
      const lowC = c.toLowerCase();
      const lowItem = item.toLowerCase();
      return lowC.includes(lowItem) || lowItem.includes(lowC);
    });
  };

  const Column = ({ title, items }: { title: string, items: string[] }) => (
    <div style={{ flex: 1, backgroundColor: '#0d1117', padding: '15px', borderRadius: '8px', border: '1px solid #30363d', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ marginTop: 0, borderBottom: '1px solid #30363d', paddingBottom: '10px', color: '#c9d1d9' }}>{title}</h3>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.length === 0 ? <div style={{ color: '#8b949e', fontStyle: 'italic' }}>Empty</div> : null}
        {items.map((item, i) => {
          const highlighted = hoveredItem ? isHighlighted(item) : true; // if nothing hovered, all are bright
          
          return (
            <div 
              key={i} 
              onMouseEnter={() => setHoveredItem(item)}
              onMouseLeave={() => setHoveredItem(null)}
              style={{ 
                backgroundColor: highlighted ? '#161b22' : '#010409', 
                padding: '12px', 
                borderRadius: '6px', 
                border: `1px solid ${highlighted ? (hoveredItem === item ? '#388bfd' : '#21262d') : '#0d1117'}`, 
                fontSize: '13px', 
                lineHeight: '1.4',
                color: highlighted ? '#c9d1d9' : '#484f58',
                transition: 'all 0.2s',
                cursor: 'pointer'
              }}
            >
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid #30363d', paddingBottom: '10px', margin: '0 0 20px 0' }}>
        <h2 style={{ margin: 0 }}>Delta Narrative (Dashboard)</h2>
        {(!artifacts.linkages || artifacts.linkages.length === 0) && (
          <div style={{ color: '#d29922', fontSize: '13px', fontStyle: 'italic' }}>⚠️ No traceability linkages found for this change.</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'hidden' }}>
        <Column title="1. Goals & Requirements" items={proposalBullets} />
        <Column title="2. Architectural Decisions" items={designBullets} />
        <Column title="3. Action Plan (Tasks)" items={tasksBullets} />
      </div>
    </div>
  );
};
