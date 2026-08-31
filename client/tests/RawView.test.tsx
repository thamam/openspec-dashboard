import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { RawView } from '../src/components/ArtifactViewer/views/RawView.js';

// C3 regression test: RawView must post feedback to the relative /api/send-message
// endpoint (same-origin, vite-proxied) instead of a hardcoded localhost:3011 URL.

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('RawView send feedback (C3)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('posts feedback to the relative /api/send-message endpoint', async () => {
    // Simulate a text selection so the "Add Comment" affordance appears.
    window.getSelection = vi.fn().mockReturnValue({ toString: () => 'quoted text' }) as any;

    render(
      <RawView
        artifacts={{ proposal: 'Some proposal', spec: '', design: '', tasks: '' }}
        activeChange="change-a"
      />
    );

    fireEvent.mouseUp(document.getElementById('artifact-content')!);
    fireEvent.click(screen.getByText('💬 Add Comment'));

    const textarea = document.querySelector('.feedback-drawer textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'please fix this' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    fireEvent.click(screen.getByText('Send Feedback to Agent'));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/send-message');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.changeName).toBe('change-a');
    expect(body.message).toContain('please fix this');
  });
});

// C13: the artifact tabs were clickable <div>s — no keyboard focus, no role.
// They are now native <button type="button">; pin the semantics.
describe('RawView tabs (C13 a11y)', () => {
  const artifacts = { proposal: 'Prop', spec: 'Spec', design: '', tasks: 'Tasks' };

  it('renders each tab as a native button with type="button"', () => {
    render(<RawView artifacts={artifacts} activeChange="change-a" />);

    for (const id of ['tab-proposal', 'tab-spec', 'tab-design', 'tab-tasks']) {
      const el = document.getElementById(id)!;
      expect(el, `#${id}`).not.toBeNull();
      expect(el.tagName).toBe('BUTTON');
      expect(el).toHaveAttribute('type', 'button');
    }
  });

  it('tabs are keyboard-focusable and switch content on Enter/Space', async () => {
    render(<RawView artifacts={artifacts} activeChange="change-a" />);
    const user = userEvent.setup();

    // Default view jumps to the furthest populated tab (Tasks).
    expect(screen.getByText('Tasks')).toBeInTheDocument();

    const specsTab = document.getElementById('tab-spec')!;
    specsTab.focus();
    expect(specsTab).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(specsTab.className).toContain('active');

    const designTab = document.getElementById('tab-design')!;
    designTab.focus();
    await user.keyboard(' ');
    expect(designTab.className).toContain('active');
  });
});
