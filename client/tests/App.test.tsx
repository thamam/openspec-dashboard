import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../src/App.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Frontend App - App.tsx', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should render the dashboard header and input elements', () => {
    render(<App />);
    expect(screen.getByText('OpenSpec Dashboard')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter local repository absolute path...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verify Path' })).toBeInTheDocument();
  });

  it('should display loading indicator, then git/openspec status when check is successful', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exists: true, isGit: true, isOpenSpec: true }),
    });

    render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/my-repo' } });
    fireEvent.click(button);

    // Verify loading state appears
    expect(screen.getByText('Verifying...')).toBeInTheDocument();

    // Verify fetch call parameters
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/status?path=%2FUsers%2Ftest%2Fmy-repo');
    });

    // Verify status displays
    await waitFor(() => {
      expect(screen.getByText('Git: Initialized')).toBeInTheDocument();
      expect(screen.getByText('OpenSpec: Initialized')).toBeInTheDocument();
    });
  });

  it('should display error message when directory does not exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ exists: false, isGit: false, isOpenSpec: false }),
    });

    render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/invalid' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Directory does not exist')).toBeInTheDocument();
    });
  });

  it('should display generic error message if api request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(<App />);
    const input = screen.getByPlaceholderText('Enter local repository absolute path...');
    const button = screen.getByRole('button', { name: 'Verify Path' });

    fireEvent.change(input, { target: { value: '/Users/test/network-error' } });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });
  });
});
