import React, { useEffect, useRef, useState } from 'react';
import './DagViewer.css';

interface DagNode {
  id: string;
  label: string;
  type: 'proposal' | 'spec-requirement' | 'spec-scenario' | 'design-decision' | 'task';
  status?: 'pending' | 'completed';
  scenariosCount?: number;
}

interface DagEdge {
  source: string;
  target: string;
}

interface DagViewerProps {
  dag: {
    nodes: DagNode[];
    edges: DagEdge[];
  };
  dagOn: boolean;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onToggleTask: (nodeId: string) => void;
  showCritical: boolean;
  filterText: string;
}

interface RenderLine {
  sourceId: string;
  targetId: string;
  d: string;
  isHighlighted: boolean;
  isCritical: boolean;
}

const DagViewer: React.FC<DagViewerProps> = ({
  dag,
  dagOn = true,
  selectedNodeId = null,
  onSelectNode = () => {},
  onToggleTask = () => {},
  showCritical = false,
  filterText = '',
}) => {
  const [lines, setLines] = useState<RenderLine[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  // Group nodes by type columns
  const proposalNodes = dag.nodes.filter((n) => n.type === 'proposal');
  // Combine spec requirements and scenarios into the Specs column
  const specNodes = dag.nodes.filter((n) => n.type === 'spec-requirement' || n.type === 'spec-scenario');
  const designNodes = dag.nodes.filter((n) => n.type === 'design-decision');
  const taskNodes = dag.nodes.filter((n) => n.type === 'task');

  // Compute full reachability set (undirected BFS) for neighbor highlighting
  const getNeighborhood = (startId: string | null): Set<string> => {
    const reachable = new Set<string>();
    if (!startId) return reachable;

    reachable.add(startId);
    const queue = [startId];

    // Build undirected adjacency list
    const adj = new Map<string, string[]>();
    dag.edges.forEach((edge) => {
      if (!adj.has(edge.source)) adj.set(edge.source, []);
      if (!adj.has(edge.target)) adj.set(edge.target, []);
      adj.get(edge.source)!.push(edge.target);
      adj.get(edge.target)!.push(edge.source);
    });

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adj.get(curr) || [];
      for (const n of neighbors) {
        if (!reachable.has(n)) {
          reachable.add(n);
          queue.push(n);
        }
      }
    }
    return reachable;
  };

  const highlightedNodes = getNeighborhood(selectedNodeId);

  // Compute critical nodes (ancestors of pending tasks)
  const getCriticalNodes = (): Set<string> => {
    const critical = new Set<string>();
    const pendingTasks = dag.nodes.filter((n) => n.type === 'task' && n.status === 'pending');
    
    // BFS backwards along directed edges
    const queue = pendingTasks.map((t) => t.id);
    queue.forEach((id) => critical.add(id));

    // Build reverse adjacency list (target -> sources)
    const revAdj = new Map<string, string[]>();
    dag.edges.forEach((edge) => {
      if (!revAdj.has(edge.target)) revAdj.set(edge.target, []);
      revAdj.get(edge.target)!.push(edge.source);
    });

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const parents = revAdj.get(curr) || [];
      for (const p of parents) {
        if (!critical.has(p)) {
          critical.add(p);
          queue.push(p);
        }
      }
    }
    return critical;
  };

  const criticalNodes = getCriticalNodes();

  // Helper: Draw curved lines between elements
  const drawLines = () => {
    if (!svgRef.current) return;
    const containerRect = svgRef.current.getBoundingClientRect();
    
    const computedLines: RenderLine[] = [];

    dag.edges.forEach((edge) => {
      const srcEl = document.getElementById(edge.source);
      const dstEl = document.getElementById(edge.target);

      if (srcEl && dstEl) {
        const srcRect = srcEl.getBoundingClientRect();
        const dstRect = dstEl.getBoundingClientRect();

        const x1 = srcRect.right - containerRect.left;
        const y1 = srcRect.top + srcRect.height / 2 - containerRect.top;

        const x2 = dstRect.left - containerRect.left;
        const y2 = dstRect.top + dstRect.height / 2 - containerRect.top;

        // Use the exact Cubic Bezier handles from the mockup
        const dx = Math.max(34, (x2 - x1) * 0.55);
        const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

        // Determine if line is highlighted
        const isHighlighted = selectedNodeId !== null && 
          highlightedNodes.has(edge.source) && 
          highlightedNodes.has(edge.target);

        // Determine if line is on the critical path
        const isCritical = criticalNodes.has(edge.source) && criticalNodes.has(edge.target);

        computedLines.push({
          sourceId: edge.source,
          targetId: edge.target,
          d,
          isHighlighted,
          isCritical,
        });
      }
    });

    setLines(computedLines);
  };

  useEffect(() => {
    // Delay draw lines slightly to allow browser rendering/layout to settle
    const timer = setTimeout(drawLines, 50);
    window.addEventListener('resize', drawLines);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', drawLines);
    };
  }, [dag, selectedNodeId, showCritical, filterText, dagOn]);

  // Handle node selection
  const handleNodeClick = (nodeId: string) => {
    if (selectedNodeId === nodeId) {
      onSelectNode(null);
    } else {
      onSelectNode(nodeId);
    }
  };

  // Determine if a node should be filtered out
  const isFiltered = (node: DagNode): boolean => {
    if (!filterText.trim()) return false;
    return !node.label.toLowerCase().includes(filterText.toLowerCase());
  };

  const renderNode = (node: DagNode) => {
    const filtered = isFiltered(node);
    const isNodeSelected = selectedNodeId === node.id;
    const isNodeHighlighted = selectedNodeId !== null && highlightedNodes.has(node.id);
    const isNodeCritical = showCritical && criticalNodes.has(node.id);

    let className = 'dag-node';
    if (filtered) className += ' filtered-out';
    if (isNodeSelected) className += ' selected';
    if (selectedNodeId !== null && !isNodeHighlighted && !filtered) className += ' faded';
    if (isNodeHighlighted) className += ' highlighted';
    if (isNodeCritical) className += ' critical';

    return (
      <div
        key={node.id}
        id={node.id}
        className={className}
        onClick={() => handleNodeClick(node.id)}
      >
        <div className="node-content">
          <span className="node-type">{node.type.replace('spec-', '')}</span>
          <p className="node-label">{node.label}</p>
          {node.type === 'spec-requirement' && node.scenariosCount !== undefined && (
            <div className="node-scenarios-count">
              {node.scenariosCount} scenario{node.scenariosCount !== 1 ? 's' : ''}
            </div>
          )}
          {node.type === 'task' && (
            <div className="task-checkbox-container" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={node.status === 'completed'}
                onChange={() => onToggleTask(node.id)}
                className="task-node-checkbox"
                id={`task-check-${node.id}`}
              />
              <label htmlFor={`task-check-${node.id}`} className={`task-status ${node.status}`}>
                {node.status === 'completed' ? '✓ Done' : '○ Pending'}
              </label>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="dag-container">
      <div className="dag-canvas-wrapper">
        <svg ref={svgRef} className="dag-svg-overlay">
          {dagOn && lines.map((line, idx) => {
            let className = 'dag-edge-line';
            if (selectedNodeId !== null && line.isHighlighted) className += ' highlighted';
            if (selectedNodeId !== null && !line.isHighlighted) className += ' faded';
            if (showCritical && line.isCritical) className += ' critical';
            
            return (
              <path
                key={`${line.sourceId}-${line.targetId}-${idx}`}
                d={line.d}
                className={className}
              />
            );
          })}
        </svg>

        <div className="dag-columns">
          <div className="dag-column">
            <h4>Proposal</h4>
            <div className="nodes-stack">{proposalNodes.map(renderNode)}</div>
          </div>
          <div className="dag-column">
            <h4>Specs</h4>
            <div className="nodes-stack">{specNodes.map(renderNode)}</div>
          </div>
          <div className="dag-column">
            <h4>Design</h4>
            <div className="nodes-stack">{designNodes.map(renderNode)}</div>
          </div>
          <div className="dag-column">
            <h4>Tasks</h4>
            <div className="nodes-stack">{taskNodes.map(renderNode)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DagViewer;
