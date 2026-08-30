import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { app } from '../src/app.js';

// Mock child_process.spawn so no real tmux is needed; capture every call.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, spawn: vi.fn() };
});

const mockedSpawn = vi.mocked(spawn);

function fakeChild(exitCode = 0, error?: Error) {
  const child = new EventEmitter() as any;
  const origOn = child.on.bind(child);
  // Emit only once the handler has attached its 'close' listener — the HTTP
  // request takes several ticks to reach the route, so a bare nextTick at
  // construction time fires before any listener exists.
  child.on = (event: string, listener: (...args: any[]) => void) => {
    origOn(event, listener);
    if (event === 'close') {
      process.nextTick(() => {
        if (error) child.emit('error', error);
        child.emit('close', exitCode);
      });
    }
    return child;
  };
  return child;
}

describe('POST /api/send-message — spawn contract (S3)', () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
  });

  it('sends a legit message via tmux argv with no shell', async () => {
    mockedSpawn.mockReturnValue(fakeChild(0));

    const response = await request(app).post('/api/send-message').send({
      sessionName: 'agent-my-change',
      message: 'hello world',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(mockedSpawn).toHaveBeenCalledWith(
      'tmux',
      ['send-keys', '-t', 'agent-my-change', 'hello world', 'C-m']
    );
    // No shell option — metacharacters cannot be interpreted
    const opts = mockedSpawn.mock.calls[0][2];
    expect(opts?.shell ?? false).toBe(false);
  });

  it('derives sessionName from changeName as agent-<changeName>', async () => {
    mockedSpawn.mockReturnValue(fakeChild(0));

    const response = await request(app).post('/api/send-message').send({
      changeName: 'my-change',
      message: 'hi',
    });

    expect(response.status).toBe(200);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'tmux',
      ['send-keys', '-t', 'agent-my-change', 'hi', 'C-m']
    );
  });

  it('passes a message full of shell metacharacters through as one literal argv element', async () => {
    mockedSpawn.mockReturnValue(fakeChild(0));
    const message = 'run `id` ; $(whoami) && rm -rf ~ | "quoted" \'single\' \\ escaped';

    const response = await request(app).post('/api/send-message').send({
      sessionName: 'agent-x',
      message,
    });

    expect(response.status).toBe(200);
    expect(mockedSpawn).toHaveBeenCalledWith(
      'tmux',
      ['send-keys', '-t', 'agent-x', message, 'C-m']
    );
  });

  it.each([
    'x; touch /tmp/pwn; #',
    'x$(touch /tmp/pwn)',
    'x`touch /tmp/pwn`',
    'x && touch /tmp/pwn',
    'x | sh',
    'x y',
    'x"y',
    "x'y",
  ])('rejects malicious sessionName %j with 400 and never spawns', async (sessionName) => {
    const response = await request(app).post('/api/send-message').send({
      sessionName,
      message: 'hello',
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Invalid sessionName/);
    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('accepts provider-style session names (agent-task-<timestamp>)', async () => {
    mockedSpawn.mockReturnValue(fakeChild(0));

    const response = await request(app).post('/api/send-message').send({
      sessionName: 'agent-task-1693526400000',
      message: 'ok',
    });

    expect(response.status).toBe(200);
  });

  it('returns 400 when message or session identity is missing', async () => {
    const noMessage = await request(app).post('/api/send-message').send({ sessionName: 'agent-x' });
    expect(noMessage.status).toBe(400);

    const noSession = await request(app).post('/api/send-message').send({ message: 'hi' });
    expect(noSession.status).toBe(400);

    expect(mockedSpawn).not.toHaveBeenCalled();
  });

  it('returns 500 when tmux exits non-zero', async () => {
    mockedSpawn.mockReturnValue(fakeChild(1));

    const response = await request(app).post('/api/send-message').send({
      sessionName: 'agent-x',
      message: 'hi',
    });

    expect(response.status).toBe(500);
  });

  it('returns 500 (no crash) when tmux binary is missing (spawn ENOENT)', async () => {
    mockedSpawn.mockReturnValue(fakeChild(0, new Error('spawn tmux ENOENT')));

    const response = await request(app).post('/api/send-message').send({
      sessionName: 'agent-x',
      message: 'hi',
    });

    expect(response.status).toBe(500);
  });
});
