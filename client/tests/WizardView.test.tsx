import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { WizardView } from '../src/components/ArtifactViewer/views/WizardView';
import { Artifacts } from '../src/types';

// C5: the "Reject (Needs Changes)" button had no onClick and no backing
// capability (no reject/feedback endpoint reachable from this view, no
// callback prop) — a dead control, removed rather than left fake. The
// Back / Accept & Continue step navigation is real and must keep working.

const artifacts: Artifacts = {
  proposal: 'PROPOSAL_CONTENT',
  spec: 'SPEC_CONTENT',
  design: 'DESIGN_CONTENT',
  tasks: 'TASKS_CONTENT',
};

describe('WizardView', () => {
  it('renders the first step content', () => {
    render(<WizardView artifacts={artifacts} />);
    expect(screen.getByText('PROPOSAL_CONTENT')).toBeInTheDocument();
    expect(screen.getByText('Verify Goals & Requirements')).toBeInTheDocument();
  });

  it('has no Reject button (dead control removed)', () => {
    render(<WizardView artifacts={artifacts} />);
    expect(screen.queryByRole('button', { name: /reject/i })).toBeNull();
  });

  it('Accept & Continue advances steps and Back returns', () => {
    render(<WizardView artifacts={artifacts} />);

    const accept = screen.getByRole('button', { name: /accept & continue/i });
    fireEvent.click(accept);
    expect(screen.getByText('SPEC_CONTENT')).toBeInTheDocument();
    expect(screen.getByText('Verify Functional Specs')).toBeInTheDocument();

    const back = screen.getByRole('button', { name: /back/i });
    fireEvent.click(back);
    expect(screen.getByText('PROPOSAL_CONTENT')).toBeInTheDocument();
  });
});
