// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import BrainstormWizard from '../src/components/BrainstormWizard.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('BrainstormWizard Component', () => {
  const mockOnCommitSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const defaultProps = {
    repoPath: '/Users/test/my-repo',
    onCommitSuccess: mockOnCommitSuccess,
    onCancel: mockOnCancel,
  };

  beforeEach(() => {
    mockFetch.mockReset();
    mockOnCommitSuccess.mockReset();
    mockOnCancel.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('should render the start form initially', () => {
    render(<BrainstormWizard {...defaultProps} />);
    expect(screen.getByText('Brainstorm & Stress-Test Feature')).toBeInTheDocument();
    expect(screen.getByLabelText('Temporary Change Name (kebab-case):')).toBeInTheDocument();
    expect(screen.getByLabelText('Initial Raw Feature Idea:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Brainstorming' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('should display validation error if change name is empty or not kebab-case', () => {
    render(<BrainstormWizard {...defaultProps} />);
    const startBtn = screen.getByRole('button', { name: 'Start Brainstorming' });

    // Try starting with empty fields
    fireEvent.click(startBtn);
    expect(screen.getByText('Change name is required.')).toBeInTheDocument();

    // Fill change name with invalid format
    const nameInput = screen.getByLabelText('Temporary Change Name (kebab-case):');
    fireEvent.change(nameInput, { target: { value: 'Invalid Name' } });
    fireEvent.click(startBtn);
    expect(screen.getByText('Change name must be kebab-case (e.g. my-feature).')).toBeInTheDocument();
  });

  it('should start brainstorming session successfully and display chat screen', async () => {
    const mockLlmResponse = `[DECISIONS]
- [OPEN] Domain model for points
- [OPEN] API validation logic
[END_DECISIONS]

Question 1: How do you plan to store points?
Recommended: Use integer database column in User table`;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: mockLlmResponse }),
    });

    render(<BrainstormWizard {...defaultProps} />);
    const nameInput = screen.getByLabelText('Temporary Change Name (kebab-case):');
    const ideaInput = screen.getByLabelText('Initial Raw Feature Idea:');
    const startBtn = screen.getByRole('button', { name: 'Start Brainstorming' });

    fireEvent.change(nameInput, { target: { value: 'point-system' } });
    fireEvent.change(ideaInput, { target: { value: 'Allow users to earn points' } });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/brainstorm/start',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            repoPath: '/Users/test/my-repo',
            changeName: 'point-system',
            initialIdea: 'Allow users to earn points',
            provider: 'gemini',
            model: 'gemini-1.5-flash',
            customEndpoint: '',
            customApiKey: '',
          }),
        })
      );
    });

    // Check that chat interface and sidebar decision tree are rendered
    await waitFor(() => {
      expect(screen.getByText('Domain model for points')).toBeInTheDocument();
      expect(screen.getByText('API validation logic')).toBeInTheDocument();
      expect(screen.getByText(/How do you plan to store points\?/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Accept Recommendation/i })).toBeInTheDocument();
    });
  });

  it('should submit chat message successfully', async () => {
    const mockLlmResponse1 = `[DECISIONS]
- [OPEN] Storage strategy
[END_DECISIONS]

Question 1: Where to store points?
Recommended: Database table`;

    const mockLlmResponse2 = `[DECISIONS]
- [RESOLVED] Storage strategy
- [OPEN] Exchange rate
[END_DECISIONS]

Question 2: What is the exchange rate?
Recommended: 100 points = $1`;

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: mockLlmResponse1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: mockLlmResponse2 }),
      });

    render(<BrainstormWizard {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('Temporary Change Name (kebab-case):'), { target: { value: 'points' } });
    fireEvent.change(screen.getByLabelText('Initial Raw Feature Idea:'), { target: { value: 'earn points' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start Brainstorming' }));

    await waitFor(() => {
      expect(screen.getByText(/Where to store points\?/i)).toBeInTheDocument();
    });

    const chatInput = screen.getByPlaceholderText('Type a question or message...');
    const sendBtn = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(chatInput, { target: { value: 'I will use MySQL' } });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        '/api/brainstorm/chat',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            repoPath: '/Users/test/my-repo',
            changeName: 'points',
            initialIdea: 'earn points',
            messages: [
              { role: 'user', content: 'Help me design this feature: earn points' },
              { role: 'assistant', content: mockLlmResponse1 },
              { role: 'user', content: 'I will use MySQL' },
            ],
            provider: 'gemini',
            model: 'gemini-1.5-flash',
            customEndpoint: '',
            customApiKey: '',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/What is the exchange rate\?/i)).toBeInTheDocument();
      expect(screen.getByText('Exchange rate')).toBeInTheDocument();
    });
  });

  it('should automatically submit the recommendation when clicking Accept Recommendation', async () => {
    const mockLlmResponse1 = `[DECISIONS]
- [OPEN] Storage strategy
[END_DECISIONS]

Question 1: Where to store points?
Recommended: Database table`;

    const mockLlmResponse2 = `[DECISIONS]
- [RESOLVED] Storage strategy
- [OPEN] Exchange rate
[END_DECISIONS]

Question 2: What is the exchange rate?
Recommended: 100 points = $1`;

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: mockLlmResponse1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: mockLlmResponse2 }),
      });

    render(<BrainstormWizard {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('Temporary Change Name (kebab-case):'), { target: { value: 'points' } });
    fireEvent.change(screen.getByLabelText('Initial Raw Feature Idea:'), { target: { value: 'earn points' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start Brainstorming' }));

    await waitFor(() => {
      expect(screen.getByText(/Where to store points\?/i)).toBeInTheDocument();
    });

    const acceptBtn = screen.getByRole('button', { name: /Accept Recommendation/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        '/api/brainstorm/chat',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            repoPath: '/Users/test/my-repo',
            changeName: 'points',
            initialIdea: 'earn points',
            messages: [
              { role: 'user', content: 'Help me design this feature: earn points' },
              { role: 'assistant', content: mockLlmResponse1 },
              { role: 'user', content: 'Database table' },
            ],
            provider: 'gemini',
            model: 'gemini-1.5-flash',
            customEndpoint: '',
            customApiKey: '',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/What is the exchange rate\?/i)).toBeInTheDocument();
    });
  });

  it('should call commit API and trigger success callback when committing decisions', async () => {
    const mockLlmResponse1 = `[DECISIONS]
- [OPEN] Storage strategy
[END_DECISIONS]

Question 1: Where to store points?
Recommended: Database table`;

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reply: mockLlmResponse1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    render(<BrainstormWizard {...defaultProps} />);
    fireEvent.change(screen.getByLabelText('Temporary Change Name (kebab-case):'), { target: { value: 'points' } });
    fireEvent.change(screen.getByLabelText('Initial Raw Feature Idea:'), { target: { value: 'earn points' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start Brainstorming' }));

    await waitFor(() => {
      expect(screen.getByText(/Where to store points\?/i)).toBeInTheDocument();
    });

    const commitBtn = screen.getByRole('button', { name: 'Commit & Generate Change' });
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        '/api/brainstorm/commit',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            repoPath: '/Users/test/my-repo',
            changeName: 'points',
            initialIdea: 'earn points',
            messages: [
              { role: 'user', content: 'Help me design this feature: earn points' },
              { role: 'assistant', content: mockLlmResponse1 },
            ],
            provider: 'gemini',
            model: 'gemini-1.5-flash',
            customEndpoint: '',
            customApiKey: '',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(mockOnCommitSuccess).toHaveBeenCalledWith('points');
    });
  });
});
