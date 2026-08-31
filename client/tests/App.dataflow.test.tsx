import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import App from '../src/App.js';

// C1/C2/C4 regression tests: App.tsx data-flow around loadChanges/loadArtifacts.
// Fetch is mocked per-URL so we control response order and status precisely.

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

interface Deferred {
  promise: Promise<any>;
  resolve: (value: any) => void;
}

function deferred(): Deferred {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((res) => { resolve = res; });
  return { promise, resolve };
}

function jsonResponse(body: any, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

// Flush all pending promise chains (fetch -> json -> setState).
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

// Flush microtasks only — safe with fake timers (which don't fake microtasks).
const flushMicrotasks = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

const artifactsPayload = (proposal: string) => ({
  artifacts: { proposal, spec: '', design: '', tasks: '' },
  parsedTasks: [],
  files: [],
});

describe('App data flow (C1/C2/C4)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('C1: discards a stale artifacts response that resolves after a newer change was selected', async () => {
    const pendingArtifacts: Record<string, Deferred[]> = {};
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/changes')) {
        return Promise.resolve(jsonResponse([
          { id: 'change-a', title: 'Change A' },
          { id: 'change-b', title: 'Change B' },
        ]));
      }
      if (url.includes('/api/artifacts')) {
        const change = new URL(url, 'http://localhost').searchParams.get('change')!;
        const d = deferred();
        (pendingArtifacts[change] ||= []).push(d);
        return d.promise;
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const { container } = render(<App />);
    await flush(); // loadChanges resolves -> activeChange auto-selects change-a -> artifacts fetch pending

    expect(pendingArtifacts['change-a']).toHaveLength(1);

    // Switch to change-b while change-a's fetch is still in flight.
    fireEvent.click(container.querySelector('#nav-item-change-b')!);
    await flush();
    expect(pendingArtifacts['change-b']).toHaveLength(1);

    // The NEWER request (change-b) resolves first...
    pendingArtifacts['change-b'][0].resolve(jsonResponse(artifactsPayload('PROPOSAL_B')));
    await flush();
    fireEvent.click(screen.getByText('Raw Diffs (L4)'));
    expect(screen.getByText('PROPOSAL_B')).toBeInTheDocument();

    // ...then the STALE request (change-a) resolves. It must not overwrite change-b's data.
    pendingArtifacts['change-a'][0].resolve(jsonResponse(artifactsPayload('PROPOSAL_A')));
    await flush();
    expect(screen.getByText('PROPOSAL_B')).toBeInTheDocument();
    expect(screen.queryByText('PROPOSAL_A')).not.toBeInTheDocument();
  });

  it('C1: skips the 2s poll tick while an artifacts fetch is still in flight', async () => {
    vi.useFakeTimers();
    const pendingArtifacts: Deferred[] = [];
    let artifactsCalls = 0;
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/changes')) {
        return Promise.resolve(jsonResponse([{ id: 'change-a', title: 'Change A' }]));
      }
      if (url.includes('/api/artifacts')) {
        artifactsCalls++;
        const d = deferred();
        pendingArtifacts.push(d);
        return d.promise;
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    render(<App />);
    await flushMicrotasks(); // loadChanges -> activeChange=change-a -> first artifacts fetch pending

    expect(artifactsCalls).toBe(1);

    // First poll tick fires while the initial load is still in flight: must be skipped.
    await act(async () => { vi.advanceTimersByTime(2000); });
    await flushMicrotasks();
    expect(artifactsCalls).toBe(1);

    // Once the in-flight request settles, the next poll tick fetches again.
    pendingArtifacts[0].resolve(jsonResponse(artifactsPayload('PROPOSAL_A')));
    await flushMicrotasks();
    await act(async () => { vi.advanceTimersByTime(2000); });
    await flushMicrotasks();
    expect(artifactsCalls).toBe(2);
  });

  it('C2: switching workspace resets the active change and clears stale artifacts', async () => {
    mockFetch.mockImplementation((url: string) => {
      const parsed = new URL(url, 'http://localhost');
      const path = parsed.searchParams.get('path') || '';
      if (url.includes('/api/changes')) {
        if (path.includes('repo-b')) {
          return Promise.resolve(jsonResponse([{ id: 'change-b', title: 'Change B' }]));
        }
        return Promise.resolve(jsonResponse([{ id: 'change-a', title: 'Change A' }]));
      }
      if (url.includes('/api/artifacts')) {
        const change = parsed.searchParams.get('change');
        // The old workspace's change does not exist in repo-b: server 404s with an error body.
        if (path.includes('repo-b') && change === 'change-a') {
          return Promise.resolve(jsonResponse({ error: 'Change not found' }, false, 404));
        }
        if (change === 'change-b') {
          return Promise.resolve(jsonResponse(artifactsPayload('PROPOSAL_B')));
        }
        return Promise.resolve(jsonResponse(artifactsPayload('PROPOSAL_A')));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const { container } = render(<App />);
    await flush();

    // Repo A loaded: change-a selected with its artifacts on screen.
    fireEvent.click(screen.getByText('Raw Diffs (L4)'));
    expect(screen.getByText('PROPOSAL_A')).toBeInTheDocument();
    expect(container.querySelector('#nav-item-change-a.active')).not.toBeNull();

    // Switch workspace to repo-b via the WorkspaceSelector input.
    const input = container.querySelector('.workspace-path-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '/tmp/repo-b' } });
    fireEvent.click(screen.getByText('Load'));
    await flush();
    await flush();

    // Old workspace's artifacts must be gone; repo-b's first change is selected and loaded.
    expect(screen.queryByText('PROPOSAL_A')).not.toBeInTheDocument();
    expect(screen.getByText('PROPOSAL_B')).toBeInTheDocument();
    expect(container.querySelector('#nav-item-change-b.active')).not.toBeNull();
  });

  it('C4: an {error} body from /api/changes does not crash the changes list', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/changes')) {
        return Promise.resolve(jsonResponse({ error: 'boom' }, false, 500));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    render(<App />);
    await flush();

    // The app shell still renders and the changes pane shows no bogus entries.
    expect(screen.getByText('OpenSpec')).toBeInTheDocument();
    expect(screen.getByText('Changes')).toBeInTheDocument();
  });
});
