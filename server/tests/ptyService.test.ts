import { describe, it, expect, vi } from 'vitest';
import { PtyService } from '../src/services/PtyService.js';
import { Server } from 'socket.io';

describe('PtyService - Native PTY Stream Handler', () => {
  it('should instantiate PtyService cleanly', () => {
    const mockIo = {
      on: vi.fn(),
    } as unknown as Server;

    const ptyService = new PtyService(mockIo);
    expect(ptyService).toBeDefined();

    ptyService.init();
    expect(mockIo.on).toHaveBeenCalledWith('connection', expect.any(Function));
  });
});
