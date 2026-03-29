import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlaybackScheduler } from '@webaudio-core';
import type AudioContextManager from '@webaudio-core/context/AudioContextManager.js';
import type { ISoundInstance } from '@webaudio-core/types/ISoundInstance.js';

describe('PlaybackScheduler', () => {
    let mockContextManager: any;
    let mockInstance: any;
    let scheduler: PlaybackScheduler;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    let endedHandler: Function;
    let offSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContextManager = {
            currentTime: 100
        } as unknown as AudioContextManager;

        offSpy = vi.fn();

        mockInstance = {
            play: vi.fn(),
            stop: vi.fn(),
            cancelScheduled: vi.fn(),
            on: vi.fn().mockImplementation((event, handler) => {
                if (event === 'ended') endedHandler = handler;
                return offSpy;
            })
        } as unknown as ISoundInstance;

        scheduler = new PlaybackScheduler(mockContextManager);
    });

    it('should schedule play accurately using context currentTime', () => {
        const id = scheduler.schedulePlay(mockInstance, 2.5, 1, 5);

        expect(id).toBe(1);

        expect(mockInstance.play).toHaveBeenCalledWith(102.5, 1, 5);

        expect(mockInstance.on).toHaveBeenCalledWith('ended', expect.any(Function));
    });

    it('should schedule stop accurately', () => {
        const id = scheduler.scheduleStop(mockInstance, 5);

        expect(id).toBe(1);
        expect(mockInstance.stop).toHaveBeenCalledWith(105);
    });

    it('should cancel a specific scheduled event by ID', () => {
        const playId = scheduler.schedulePlay(mockInstance, 2);

        scheduler.cancel(playId);

        expect(mockInstance.cancelScheduled).toHaveBeenCalledTimes(1);

        scheduler.cancel(playId);
        expect(mockInstance.cancelScheduled).toHaveBeenCalledTimes(1);
    });

    it('should cancel ALL events for a specific instance', () => {
        scheduler.schedulePlay(mockInstance, 1);
        scheduler.scheduleStop(mockInstance, 5);

        scheduler.cancelAll(mockInstance);

        expect(mockInstance.cancelScheduled).toHaveBeenCalledTimes(2);
    });

    it('should auto-cleanup map and unsubscribe when instance ends', () => {
        const playId = scheduler.schedulePlay(mockInstance, 1);

        endedHandler();

        expect(offSpy).toHaveBeenCalledTimes(1);

        scheduler.cancel(playId);
        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();
    });

    it('should clear instance from registry without calling cancelScheduled', () => {
        const id = scheduler.schedulePlay(mockInstance, 1);

        scheduler.clearInstance(mockInstance);

        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();

        scheduler.cancel(id);
        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();
    });

    it('should handle self-cleanup of the "ended" listener to prevent memory leaks', () => {
        scheduler.schedulePlay(mockInstance, 0);

        expect(endedHandler).toBeDefined();

        endedHandler();

        expect(offSpy).toHaveBeenCalledTimes(1);
    });

    it('should support multiple concurrent instances and clear them independently', () => {
        const otherInstance = { ...mockInstance, on: vi.fn().mockReturnValue(vi.fn()) };

        scheduler.schedulePlay(mockInstance, 1);
        scheduler.schedulePlay(otherInstance, 1);

        scheduler.clearInstance(mockInstance);

        scheduler.cancelAll(mockInstance);
        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();

        scheduler.cancelAll(otherInstance);
        expect(otherInstance.cancelScheduled).toHaveBeenCalled();
    });

    it('should auto-cleanup map and unsubscribe when instance ends after scheduleStop', () => {
        const stopId = scheduler.scheduleStop(mockInstance, 5);

        expect(endedHandler).toBeDefined();
        endedHandler();

        expect(offSpy).toHaveBeenCalledTimes(1);

        mockInstance.cancelScheduled.mockClear();
        scheduler.cancel(stopId);
        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();
    });
});
