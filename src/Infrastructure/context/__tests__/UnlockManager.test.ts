import { describe, it, expect, vi, beforeEach } from 'vitest';

import UnlockManager from '../UnlockManager.js';

import type { AudioCtx } from '@infrastructure/types/IAudioContext.js';

describe('UnlockManager', () => {
    let mockContext: any;
    let mockBufferSource: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockBufferSource = {
            buffer: null,
            connect: vi.fn(),
            start: vi.fn()
        };

        mockContext = {
            state: 'suspended',
            sampleRate: 44_100,
            destination: 'mock_destination',
            createBuffer: vi.fn().mockReturnValue('mock_buffer'),
            createBufferSource: vi.fn().mockReturnValue(mockBufferSource),
            resume: vi.fn().mockResolvedValue(undefined)
        };
    });

    it('should set unlocked to true and return early if context is already running', async () => {
        mockContext.state = 'running';
        const manager = new UnlockManager(mockContext as AudioCtx);

        await manager.unlock();

        expect((manager as any).unlocked).toBe(true);
        expect(mockContext.createBuffer).not.toHaveBeenCalled();
        expect(mockContext.resume).not.toHaveBeenCalled();
    });

    it('should skip silent buffer but STILL call resume on subsequent calls if suspended', async () => {
        const manager = new UnlockManager(mockContext as AudioCtx);

        await manager.unlock();
        expect(mockContext.createBuffer).toHaveBeenCalledTimes(1);
        expect(mockContext.resume).toHaveBeenCalledTimes(1);

        mockContext.resume.mockClear();
        mockContext.createBuffer.mockClear();

        mockContext.state = 'suspended';

        await manager.unlock();

        expect(mockContext.createBuffer).not.toHaveBeenCalled();
        expect(mockContext.resume).toHaveBeenCalledTimes(1);
    });

    it('should play a silent buffer and resume context if state is suspended', async () => {
        const manager = new UnlockManager(mockContext as AudioCtx);

        await manager.unlock();

        expect(mockContext.createBuffer).toHaveBeenCalledWith(1, 1, 44_100);
        expect(mockContext.createBufferSource).toHaveBeenCalled();

        expect(mockBufferSource.buffer).toBe('mock_buffer');
        expect(mockBufferSource.connect).toHaveBeenCalledWith('mock_destination');
        expect(mockBufferSource.start).toHaveBeenCalledWith(0);

        expect(mockContext.resume).toHaveBeenCalledTimes(1);
        expect((manager as any).unlocked).toBe(true);
    });

    it('should catch errors during silent buffer playback and still call resume()', async () => {
        mockContext.createBuffer.mockImplementationOnce(() => {
            throw new Error('NotSupportedError: failed to create buffer');
        });

        const manager = new UnlockManager(mockContext as AudioCtx);

        await expect(manager.unlock()).resolves.not.toThrow();

        expect(mockContext.resume).toHaveBeenCalledTimes(1);
        expect((manager as any).unlocked).toBe(true);
    });
});
