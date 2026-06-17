import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DagViewer from '../src/components/DagViewer.js';

// Mock getBoundingClientRect for layout calculations in test
beforeAll(() => {
  window.HTMLElement.prototype.getBoundingClientRect = function() {
    return {
      x: 0,
      y: 0,
      top: 10,
      left: 10,
      right: 100,
      bottom: 50,
      width: 90,
      height: 40,
      toJSON: () => {}
    };
  };
});

describe('DagViewer Component', () => {
  const mockDag = {
    nodes: [
      { id: 'p-1', label: 'Cap 1', type: 'proposal' as const },
      { id: 's-1', label: 'Req 1', type: 'spec-requirement' as const },
      { id: 'd-1', label: 'Dec 1', type: 'design-decision' as const },
      { id: 't-1', label: 'Task 1', type: 'task' as const, status: 'pending' as const },
      { id: 't-2', label: 'Task 2', type: 'task' as const, status: 'completed' as const }
    ],
    edges: [
      { source: 'p-1', target: 's-1' },
      { source: 's-1', target: 'd-1' },
      { source: 'd-1', target: 't-1' }
    ]
  };

  it('should render columns and node labels', () => {
    render(<DagViewer dag={mockDag} />);
    
    // Check column headers
    expect(screen.getByText('Proposal')).toBeInTheDocument();
    expect(screen.getByText('Specs')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();

    // Check node labels
    expect(screen.getByText('Cap 1')).toBeInTheDocument();
    expect(screen.getByText('Req 1')).toBeInTheDocument();
    expect(screen.getByText('Dec 1')).toBeInTheDocument();
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
  });

  it('should highlight neighborhood nodes on click', async () => {
    render(<DagViewer dag={mockDag} />);
    
    const reqNode = screen.getByText('Req 1').closest('.dag-node');
    expect(reqNode).toBeInTheDocument();
    
    // Click Req 1
    fireEvent.click(reqNode!);

    // Clicked node should have highlighted class
    expect(reqNode).toHaveClass('highlighted');
    
    // Connected neighbors (Cap 1 and Dec 1) should be highlighted
    const capNode = screen.getByText('Cap 1').closest('.dag-node');
    const decNode = screen.getByText('Dec 1').closest('.dag-node');
    const taskNode1 = screen.getByText('Task 1').closest('.dag-node'); // indirectly connected or not immediate
    
    expect(capNode).toHaveClass('highlighted');
    expect(decNode).toHaveClass('highlighted');
  });

  it('should highlight critical path (nodes leading to pending tasks) when toggled', () => {
    render(<DagViewer dag={mockDag} />);
    
    const criticalToggle = screen.getByRole('checkbox', { name: 'Show Critical Paths' });
    fireEvent.click(criticalToggle);

    // Nodes on path to pending 't-1' (p-1, s-1, d-1, t-1) should be critical
    const capNode = screen.getByText('Cap 1').closest('.dag-node');
    const decNode = screen.getByText('Dec 1').closest('.dag-node');
    const task1Node = screen.getByText('Task 1').closest('.dag-node');
    const task2Node = screen.getByText('Task 2').closest('.dag-node'); // completed, shouldn't be critical

    expect(capNode).toHaveClass('critical');
    expect(decNode).toHaveClass('critical');
    expect(task1Node).toHaveClass('critical');
    expect(task2Node).not.toHaveClass('critical');
  });

  it('should filter nodes based on search input', () => {
    render(<DagViewer dag={mockDag} />);
    
    const searchInput = screen.getByPlaceholderText('Filter nodes by name...');
    fireEvent.change(searchInput, { target: { value: 'Dec' } });

    // 'Dec 1' should be visible, others filtered (opacity-faded or filtered class)
    const decNode = screen.getByText('Dec 1').closest('.dag-node');
    const capNode = screen.getByText('Cap 1').closest('.dag-node');

    expect(decNode).not.toHaveClass('filtered-out');
    expect(capNode).toHaveClass('filtered-out');
  });
});
