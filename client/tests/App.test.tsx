import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import App from '../src/App.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Frontend App - App.tsx', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should render the dashboard header and input elements', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([]),
    });

    render(<App />);
    expect(screen.getByText('OpenSpec')).toBeInTheDocument();
    expect(screen.getByText('v2.0 (Deterministic)')).toBeInTheDocument();
    expect(screen.getByText('Workspace:')).toBeInTheDocument();
  });
});
