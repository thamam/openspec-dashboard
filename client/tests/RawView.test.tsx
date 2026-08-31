import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
