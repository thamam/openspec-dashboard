import React, { useEffect, useRef, useState } from 'react';
import './DagViewer.css';

interface DagNode {
  id: string;
  label: string;
  type: 'proposal' | 'spec-requirement' | 'spec-scenario' | 'design-decision' | 'task';
  status?: 'pending' | 'completed';
  scenariosCount?: number;
  description?: string;
  capability?: string;
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
  isolateSelection?: boolean;
  collapsedCapabilities?: Record<string, boolean>;
  onToggleCapability?: (capName: string) => void;
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
  isolateSelection = false,
  collapsedCapabilities = {},
  onToggleCapability = () => {},
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
      let sourceId = edge.source;
      let targetId = edge.target;

      // Redirect edges if the source or target nodes are requirement cards inside collapsed capability groups
      const sourceNode = dag.nodes.find((n) => n.id === sourceId);
      if (
        sourceNode &&
        sourceNode.type === 'spec-requirement' &&
        sourceNode.capability &&
        collapsedCapabilities[sourceNode.capability]
      ) {
        sourceId = `group-${sourceNode.capability}`;
      }

      const targetNode = dag.nodes.find((n) => n.id === targetId);
      if (
        targetNode &&
        targetNode.type === 'spec-requirement' &&
        targetNode.capability &&
        collapsedCapabilities[targetNode.capability]
      ) {
        targetId = `group-${targetNode.capability}`;
      }

      // Avoid drawing a self-connector if source and target collapse to the same group header
      if (sourceId === targetId) return;

      const srcEl = document.getElementById(sourceId);
      const dstEl = document.getElementById(targetId);

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
        const isHighlighted =
          selectedNodeId !== null &&
          (highlightedNodes.has(edge.source) || highlightedNodes.has(sourceId)) &&
          (highlightedNodes.has(edge.target) || highlightedNodes.has(targetId));

        // Determine if line is on the critical path
        const isCritical = criticalNodes.has(edge.source) && criticalNodes.has(edge.target);

        computedLines.push({
          sourceId,
          targetId,
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
  }, [dag, selectedNodeId, showCritical, filterText, dagOn, isolateSelection, collapsedCapabilities]);

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
    if (filterText.trim() && !node.label.toLowerCase().includes(filterText.toLowerCase())) {
      return true;
    }
    if (isolateSelection && selectedNodeId !== null) {
      return !highlightedNodes.has(node.id);
    }
    return false;
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

  // Group specs nodes by capability name
  const capabilities = Array.from(
    new Set(specNodes.map((n) => n.capability).filter((c): c is string => !!c))
  );
  const uncategorizedSpecs = specNodes.filter((n) => !n.capability);

  const renderCapabilityGroup = (capName: string) => {
    const capSpecs = specNodes.filter((n) => n.capability === capName);
    const hasVisibleNodes = capSpecs.some((n) => !isFiltered(n));

    const isCollapsed = collapsedCapabilities[capName] === true;
    const isGroupSelected = selectedNodeId && capSpecs.some((n) => n.id === selectedNodeId);
    const isGroupHighlighted = selectedNodeId && capSpecs.some((n) => highlightedNodes.has(n.id));

    let headerClassName = 'dag-group-header';
    if (isCollapsed) headerClassName += ' collapsed';
    if (isGroupSelected) headerClassName += ' selected';
    if (isGroupHighlighted) headerClassName += ' highlighted';

    return (
      <div 
        key={`group-wrapper-${capName}`} 
        className="dag-group-wrapper"
        style={!hasVisibleNodes ? { display: 'none' } : undefined}
      >
        <div
          id={`group-${capName}`}
          className={headerClassName}
          onClick={() => onToggleCapability(capName)}
        >
          <div className="group-header-content">
            <span className="group-toggle-arrow">{isCollapsed ? '▶' : '▼'}</span>
            <span className="group-title-label">{capName}</span>
            <span className="group-count-badge">
              {capSpecs.length} req{capSpecs.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        {!isCollapsed && (
          <div className="group-nodes-stack">
            {capSpecs.map(renderNode)}
          </div>
        )}
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
            <div className="nodes-stack">
              {capabilities.map(renderCapabilityGroup)}
              {uncategorizedSpecs.map(renderNode)}
            </div>
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
