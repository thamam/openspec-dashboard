import React, { useMemo, useState } from 'react';
import { Artifacts } from '../../../types';
import { getConnectedSet } from './linkages';

interface Props {
  artifacts: Artifacts;
}

interface TreeNode {
  id: string;
  level: number;
  text: string;
  children: TreeNode[];
}

const parseMarkdownTree = (md: string): TreeNode[] => {
  if (!md) return [];
  const lines = md.split('\n');
  const rootNodes: TreeNode[] = [];
  const stack: TreeNode[] = [];

  lines.forEach((line, index) => {
    let level = 0;
    let text = '';
    
    if (line.startsWith('# ')) { level = 1; text = line.substring(2); }
    else if (line.startsWith('## ')) { level = 2; text = line.substring(3); }
    else if (line.startsWith('### ')) { level = 3; text = line.substring(4); }
    else if (line.trim().startsWith('- ')) { level = 4; text = line.trim().substring(2); }
    else if (line.trim().startsWith('* ')) { level = 4; text = line.trim().substring(2); }
    
    if (level > 0 && text.trim()) {
      const node: TreeNode = { id: `node-${level}-${index}`, level, text, children: [] };
      
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      
      if (stack.length === 0) {
        rootNodes.push(node);
      } else {
        stack[stack.length - 1].children.push(node);
      }
      stack.push(node);
    }
  });
  
  return rootNodes;
};

interface TreeContextType {
  hoveredItem: string | null;
  setHoveredItem: (val: string | null) => void;
  connectedSet: Set<string>;
}
const TreeContext = React.createContext<TreeContextType | null>(null);

const TreeNodeRender: React.FC<{ node: TreeNode }> = ({ node }) => {
  const [isOpen, setIsOpen] = React.useState(true);
  const ctx = React.useContext(TreeContext);
  
  const isHighlighted = () => {
    if (!ctx || !ctx.hoveredItem) return true; // all normal if nothing hovered
    return Array.from(ctx.connectedSet).some(c => {
      const lowC = c.toLowerCase();
      const lowItem = node.text.toLowerCase();
      return lowC.includes(lowItem) || lowItem.includes(lowC);
    });
  };

  const highlighted = isHighlighted();
  
  return (
    <li style={{ margin: '8px 0' }}>
      <details 
        open={isOpen} 
        onToggle={(e) => {
          if (e.target === e.currentTarget) {
            setIsOpen((e.target as HTMLDetailsElement).open);
          }
        }}
      >
        <summary 
          onMouseEnter={() => ctx?.setHoveredItem(node.text)}
          onMouseLeave={() => ctx?.setHoveredItem(null)}
          style={{ 
            cursor: 'pointer', 
            fontWeight: node.level <= 2 ? 'bold' : 'normal', 
            color: highlighted ? (node.level === 4 ? '#8b949e' : '#c9d1d9') : '#484f58',
            backgroundColor: ctx?.hoveredItem === node.text ? '#161b22' : 'transparent',
            padding: '2px 4px',
            borderRadius: '4px',
            transition: 'all 0.2s'
          }}
        >
          {node.level === 4 ? '🔹 ' : '📁 '} {node.text}
        </summary>
        <TreeRender nodes={node.children} />
      </details>
    </li>
  );
};

const TreeRender: React.FC<{ nodes: TreeNode[] }> = ({ nodes }) => {
  if (nodes.length === 0) return null;
  return (
    <ul style={{ listStyleType: 'none', paddingLeft: '20px', borderLeft: '1px solid #30363d', margin: '10px 0' }}>
      {nodes.map(node => (
        <TreeNodeRender key={node.id} node={node} />
      ))}
    </ul>
  );
};

export const MatrixView: React.FC<Props> = ({ artifacts }) => {
  const tree = useMemo(() => {
    const combined = `
# 1. Proposal & Goals
${artifacts.proposal || 'No proposal yet'}
# 2. Specifications
${artifacts.spec || 'No specs yet'}
# 3. Technical Design
${artifacts.design || 'No design yet'}
# 4. Execution Tasks
${artifacts.tasks || 'No tasks yet'}
    `;
    return parseMarkdownTree(combined);
  }, [artifacts]);

  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const connectedSet = useMemo(() => 
    getConnectedSet(hoveredItem, artifacts.linkages), 
  [hoveredItem, artifacts.linkages]);

  return (
    <TreeContext.Provider value={{ hoveredItem, setHoveredItem, connectedSet }}>
      <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid #30363d', paddingBottom: '10px', margin: '0 0 20px 0' }}>
          <h2 style={{ margin: 0 }}>Traceability Matrix</h2>
          {(!artifacts.linkages || artifacts.linkages.length === 0) && (
            <div style={{ color: '#d29922', fontSize: '13px', fontStyle: 'italic' }}>⚠️ No traceability linkages found for this change.</div>
          )}
        </div>
        <p style={{ color: '#8b949e', fontSize: '14px' }}>This view parses the markdown documents into a collapsible requirement tree.</p>
        <div style={{ backgroundColor: '#0d1117', padding: '20px', borderRadius: '8px', border: '1px solid #30363d' }}>
          <TreeRender nodes={tree} />
        </div>
      </div>
    </TreeContext.Provider>
  );
};
