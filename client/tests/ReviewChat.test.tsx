// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ReviewChat from '../src/components/ReviewChat.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ReviewChat Component', () => {
  const defaultProps = {
    repoPath: '/Users/test/my-repo',
    changeName: 'my-feature-change',
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('should render provider selection and default model inputs', () => {
    render(<ReviewChat {...defaultProps} />);
    
    // Check main elements
    expect(screen.getByText('OpenSpec Traceability Auditor')).toBeInTheDocument();
    
    // Show settings panel
    const toggleBtn = screen.getByRole('button', { name: '⚙️ Show Settings' });
    fireEvent.click(toggleBtn);

    expect(screen.getByLabelText('Provider:')).toBeInTheDocument();
    expect(screen.getByLabelText('Model Name:')).toBeInTheDocument();
    
    // Prefilled model for Gemini should be default
    const providerSelect = screen.getByLabelText('Provider:') as HTMLSelectElement;
    expect(providerSelect.value).toBe('gemini');
    
    const modelInput = screen.getByLabelText('Model Name:') as HTMLInputElement;
    expect(modelInput.value).toBe('gemini-1.5-flash');

    // Custom API inputs should NOT be visible by default
    expect(screen.queryByLabelText('Custom Endpoint URL:')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Custom API Key (Optional):')).not.toBeInTheDocument();
  });

  it('should reveal custom endpoint inputs when Custom API provider is selected', () => {
    render(<ReviewChat {...defaultProps} />);
    
    // Show settings panel
    const toggleBtn = screen.getByRole('button', { name: '⚙️ Show Settings' });
    fireEvent.click(toggleBtn);

    const providerSelect = screen.getByLabelText('Provider:') as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: 'custom' } });
    
    expect(screen.getByLabelText('Custom Endpoint URL:')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom API Key (Optional):')).toBeInTheDocument();

    const modelInput = screen.getByLabelText('Model Name:') as HTMLInputElement;
    expect(modelInput.value).toBe('gpt-4o'); // Default for custom provider
  });

  it('should switch model to gemma2 when Ollama provider is selected', () => {
    render(<ReviewChat {...defaultProps} />);
    
    // Show settings panel
    const toggleBtn = screen.getByRole('button', { name: '⚙️ Show Settings' });
    fireEvent.click(toggleBtn);

    const providerSelect = screen.getByLabelText('Provider:') as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: 'ollama' } });
    
    const modelInput = screen.getByLabelText('Model Name:') as HTMLInputElement;
    expect(modelInput.value).toBe('gemma2');
  });

  it('should submit user typed messages to the backend API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: 'Auditor review complete. All specs matched.' }),
    });

    render(<ReviewChat {...defaultProps} />);
    
    const chatInput = screen.getByPlaceholderText('Type a question or message...') as HTMLInputElement;
    const sendButton = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(chatInput, { target: { value: 'Is my spec complete?' } });
    fireEvent.click(sendButton);

    // Should show user message in log
    expect(screen.getByText('Is my spec complete?')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/changes/${encodeURIComponent('my-feature-change')}/chat`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            repoPath: '/Users/test/my-repo',
            messages: [{ role: 'user', content: 'Is my spec complete?' }],
            provider: 'gemini',
            model: 'gemini-1.5-flash',
            customEndpoint: '',
            customApiKey: '',
          }),
        })
      );
    });

    // Should render auditor response in log
    await waitFor(() => {
      expect(screen.getByText('Auditor review complete. All specs matched.')).toBeInTheDocument();
    });
  });

  it('should send pre-canned query shortcuts', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: 'Traceability check passed: No orphans found.' }),
    });

    render(<ReviewChat {...defaultProps} />);

    const auditBtn = screen.getByRole('button', { name: '🔍 Audit Traceability' });
    fireEvent.click(auditBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/changes/${encodeURIComponent('my-feature-change')}/chat`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            repoPath: '/Users/test/my-repo',
            messages: [{ role: 'user', content: 'Audit Traceability' }],
            provider: 'gemini',
            model: 'gemini-1.5-flash',
            customEndpoint: '',
            customApiKey: '',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Traceability check passed: No orphans found.')).toBeInTheDocument();
    });
  });

  it('should display error message on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => 'Internal Server Error',
    });

    render(<ReviewChat {...defaultProps} />);

    const chatInput = screen.getByPlaceholderText('Type a question or message...');
    const sendButton = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(chatInput, { target: { value: 'hello' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Internal Server Error')).toBeInTheDocument();
    });
  });
});
