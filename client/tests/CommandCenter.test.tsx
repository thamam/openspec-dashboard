import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CommandCenter } from '../src/components/CommandCenter';

// C13: the nav items were clickable <div>s — unreachable by keyboard, invisible
// to assistive tech. They are now native <button type="button"> elements, which
// give focusability and Enter/Space activation for free. These tests pin the
// semantics: role, type, focusability, and keyboard activation.

describe('CommandCenter nav items (C13 a11y)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockProps = () => ({
    changes: [
      { id: 'change-a', title: 'Change A', status: 'active' },
      { id: 'change-b', title: 'Change B', status: 'active' }
    ],
    activeChange: 'main',
    setActiveChange: vi.fn(),
    executeCommand: vi.fn(),
    agentProvider: 'claude',
    onProviderChange: vi.fn()
  });

  it('renders nav items as native buttons with type="button"', () => {
    render(<CommandCenter {...mockProps()} />);

    for (const id of ['nav-item-main', 'nav-item-change-a', 'nav-item-change-b']) {
      const el = document.getElementById(id)!;
      expect(el, `#${id}`).not.toBeNull();
      expect(el.tagName).toBe('BUTTON');
      expect(el).toHaveAttribute('type', 'button');
    }
    // Role query finds them (a div would not).
    expect(screen.getByRole('button', { name: 'main' })).toBe(document.getElementById('nav-item-main'));
    expect(screen.getByRole('button', { name: /Change A/ })).toBe(document.getElementById('nav-item-change-a'));
  });

  it('nav items are keyboard-focusable and activate on Enter and Space', async () => {
    const props = mockProps();
    render(<CommandCenter {...props} />);
    const user = userEvent.setup();

    const changeA = document.getElementById('nav-item-change-a')!;
    changeA.focus();
    expect(changeA).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(props.setActiveChange).toHaveBeenCalledWith('change-a');

    await user.keyboard(' ');
    expect(props.setActiveChange).toHaveBeenCalledTimes(2);
    expect(props.setActiveChange).toHaveBeenLastCalledWith('change-a');
  });

  it('main nav item activates on Enter', async () => {
    const props = mockProps();
    props.activeChange = 'change-a';
    render(<CommandCenter {...props} />);
    const user = userEvent.setup();

    const mainNav = document.getElementById('nav-item-main')!;
    mainNav.focus();
    await user.keyboard('{Enter}');
    expect(props.setActiveChange).toHaveBeenCalledWith('main');
  });
});
