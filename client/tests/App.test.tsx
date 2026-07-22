import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import App from '../src/App.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

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
