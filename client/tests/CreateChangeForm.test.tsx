// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import CreateChangeForm from '../src/components/CreateChangeForm.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('CreateChangeForm Component', () => {
  const mockOnCreateSuccess = vi.fn();
  const mockOnCancel = vi.fn();
  const defaultProps = {
    repoPath: '/Users/test/my-repo',
    onCreateSuccess: mockOnCreateSuccess,
    onCancel: mockOnCancel,
  };

  beforeEach(() => {
    mockFetch.mockReset();
    mockOnCreateSuccess.mockReset();
    mockOnCancel.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('should render form inputs and modes', () => {
    render(<CreateChangeForm {...defaultProps} />);
    expect(screen.getByLabelText('Change Name (kebab-case):')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional):')).toBeInTheDocument();
    expect(screen.getByLabelText('Standard Workflow')).toBeInTheDocument();
    expect(screen.getByLabelText('Custom States')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Change' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('should show schema selector when Standard Workflow mode is selected', () => {
    render(<CreateChangeForm {...defaultProps} />);
    // Standard is default, should show schema select dropdown
    expect(screen.getByLabelText('Workflow Schema:')).toBeInTheDocument();
    expect(screen.queryByLabelText('proposal')).not.toBeInTheDocument();
  });

  it('should show checkboxes when Custom States mode is selected', () => {
    render(<CreateChangeForm {...defaultProps} />);
    const customRadio = screen.getByLabelText('Custom States');
    fireEvent.click(customRadio);

    expect(screen.queryByLabelText('Workflow Schema:')).not.toBeInTheDocument();
    expect(screen.getByLabelText('proposal')).toBeInTheDocument();
    expect(screen.getByLabelText('specs')).toBeInTheDocument();
    expect(screen.getByLabelText('design')).toBeInTheDocument();
    expect(screen.getByLabelText('tasks')).toBeInTheDocument();
  });

  it('should display validation error when name is empty', async () => {
    render(<CreateChangeForm {...defaultProps} />);
    const submitBtn = screen.getByRole('button', { name: 'Create Change' });
    fireEvent.click(submitBtn);

    expect(screen.getByText('Change name is required.')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should display validation error when custom mode has no checkboxes selected', async () => {
    render(<CreateChangeForm {...defaultProps} />);
    const customRadio = screen.getByLabelText('Custom States');
    fireEvent.click(customRadio);

    // Uncheck default checkboxes (let's assume they are checked by default, or we uncheck them)
    const proposalCheck = screen.getByLabelText('proposal') as HTMLInputElement;
    const specsCheck = screen.getByLabelText('specs') as HTMLInputElement;
    const designCheck = screen.getByLabelText('design') as HTMLInputElement;
    const tasksCheck = screen.getByLabelText('tasks') as HTMLInputElement;

    if (proposalCheck.checked) fireEvent.click(proposalCheck);
    if (specsCheck.checked) fireEvent.click(specsCheck);
    if (designCheck.checked) fireEvent.click(designCheck);
    if (tasksCheck.checked) fireEvent.click(tasksCheck);

    const nameInput = screen.getByLabelText('Change Name (kebab-case):');
    fireEvent.change(nameInput, { target: { value: 'my-feature' } });

    const submitBtn = screen.getByRole('button', { name: 'Create Change' });
    fireEvent.click(submitBtn);

    expect(screen.getByText('Select at least one state/artifact for custom workflow.')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should submit standard change proposal successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<CreateChangeForm {...defaultProps} />);
    const nameInput = screen.getByLabelText('Change Name (kebab-case):');
    const descInput = screen.getByLabelText('Description (optional):');
    const submitBtn = screen.getByRole('button', { name: 'Create Change' });

    fireEvent.change(nameInput, { target: { value: 'new-login' } });
    fireEvent.change(descInput, { target: { value: 'adds auth UI' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/changes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            repoPath: '/Users/test/my-repo',
            changeName: 'new-login',
            schemaName: 'spec-driven',
            description: 'adds auth UI',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(mockOnCreateSuccess).toHaveBeenCalledWith('new-login');
    });
  });

  it('should initialize local schema and then create change for custom states mode', async () => {
    // 1. mock schema creation response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    // 2. mock change creation response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(<CreateChangeForm {...defaultProps} />);
    const customRadio = screen.getByLabelText('Custom States');
    fireEvent.click(customRadio);

    // Keep only proposal and tasks checked
    const specsCheck = screen.getByLabelText('specs') as HTMLInputElement;
    const designCheck = screen.getByLabelText('design') as HTMLInputElement;
    if (specsCheck.checked) fireEvent.click(specsCheck);
    if (designCheck.checked) fireEvent.click(designCheck);

    const nameInput = screen.getByLabelText('Change Name (kebab-case):');
    fireEvent.change(nameInput, { target: { value: 'quick-fix' } });

    const submitBtn = screen.getByRole('button', { name: 'Create Change' });
    fireEvent.click(submitBtn);

    // Assert schema creation API called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        '/api/schema',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            repoPath: '/Users/test/my-repo',
            schemaName: 'schema-proposal-tasks',
            artifacts: ['proposal', 'tasks'],
          }),
        })
      );
    });

    // Assert change creation API called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        '/api/changes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            repoPath: '/Users/test/my-repo',
            changeName: 'quick-fix',
            schemaName: 'schema-proposal-tasks',
            description: '',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(mockOnCreateSuccess).toHaveBeenCalledWith('quick-fix');
    });
  });
});
