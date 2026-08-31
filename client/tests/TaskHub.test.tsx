import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { TaskHub } from '../src/components/TaskHub';
import { TaskItem } from '../src/types';

// C5: the "Claim Task (Agent)"/"Claim Task (Human)" buttons had no onClick and
// no backing capability (no task-claim endpoint or socket event exists;
// AgentProvider.executeTask is never invoked anywhere). Dead controls were
// removed rather than left as fake affordances.

const unassignedTask: TaskItem = {
  id: 'task-0',
  title: 'Build the thing',
  status: 'todo',
  lineNumber: 3,
};

describe('TaskHub', () => {
  it('renders tasks with title and status', () => {
    render(<TaskHub tasks={[unassignedTask]} />);
    expect(screen.getByText('Build the thing')).toBeInTheDocument();
    expect(screen.getByText('1 Total')).toBeInTheDocument();
    expect(screen.getByText('todo')).toBeInTheDocument();
  });

  it('shows no claim buttons for an unassigned todo task (dead controls removed)', () => {
    render(<TaskHub tasks={[unassignedTask]} />);
    expect(screen.queryByRole('button', { name: /claim task/i })).toBeNull();
  });

  it('shows no claim buttons for an unassigned wip task either', () => {
    render(<TaskHub tasks={[{ ...unassignedTask, status: 'wip' }]} />);
    expect(screen.queryByRole('button', { name: /claim task/i })).toBeNull();
  });

  it('still renders assignee and done styling unchanged', () => {
    render(<TaskHub tasks={[
      { ...unassignedTask, id: 'task-1', title: 'Claimed work', assignee: 'tomer', status: 'wip' },
      { ...unassignedTask, id: 'task-2', title: 'Finished work', status: 'done' },
    ]} />);
    expect(screen.getByText('@tomer (wip)')).toBeInTheDocument();
    expect(screen.getByText('Finished work')).toHaveStyle({ textDecoration: 'line-through' });
    expect(screen.queryByRole('button', { name: /claim task/i })).toBeNull();
  });
});
