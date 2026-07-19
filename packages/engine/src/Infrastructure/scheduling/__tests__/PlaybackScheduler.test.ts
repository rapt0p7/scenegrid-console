// noinspection D

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlaybackScheduler } from '@infrastructure';

import type AudioContextManager from '@infrastructure/context/AudioContextManager.js';
import type { ISoundInstance } from '@infrastructure/types/ISoundInstance.js';
import { ContextTime, Seconds } from '@scene-grid/shared';

describe('PlaybackScheduler', () => {
    let mockContextManager: any;
    let mockInstance: any;
    let scheduler: PlaybackScheduler;
    let endedHandler: any;
    let offSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContextManager = {
            context: {
                currentTime: 100
            }
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

        scheduler = new PlaybackScheduler(mockContextManager, 128);
    });

    it('should schedule play accurately using absolute targetTime', () => {
        const targetTime = 102.5 as ContextTime;
        const id = scheduler.schedulePlay(mockInstance, targetTime, 1 as Seconds, 5 as Seconds);

        expect(id).toBe(1);
        expect(mockInstance.play).toHaveBeenCalledWith(targetTime, 1, 5);
        expect(mockInstance.on).toHaveBeenCalledWith('ended', expect.any(Function));
    });

    it('should fallback to context currentTime if targetTime is 0', () => {
        scheduler.schedulePlay(mockInstance, 0 as ContextTime, 1 as Seconds, 5 as Seconds);

        expect(mockInstance.play).toHaveBeenCalledWith(100, 1, 5);
    });

    it('should schedule stop by passing relative delay to instance', () => {
        const id = scheduler.scheduleStop(mockInstance, 5 as ContextTime);

        expect(id).toBe(1);
        expect(mockInstance.stop).toHaveBeenCalledWith(5);
    });

    it('should cancel a specific scheduled event by ID', () => {
        const playId = scheduler.schedulePlay(mockInstance, 2 as ContextTime);

        scheduler.cancel(playId);

        expect(mockInstance.cancelScheduled).toHaveBeenCalledTimes(1);
        expect(offSpy).toHaveBeenCalledTimes(1);

        scheduler.cancel(playId);
        expect(mockInstance.cancelScheduled).toHaveBeenCalledTimes(1);
    });

    it('should cancel ALL events for a specific instance', () => {
        scheduler.schedulePlay(mockInstance, 1 as ContextTime);
        scheduler.schedulePlay(mockInstance, 2 as ContextTime);

        scheduler.cancelAll(mockInstance);

        expect(mockInstance.cancelScheduled).toHaveBeenCalledTimes(2);
        expect(offSpy).toHaveBeenCalledTimes(2);
    });

    it('should auto-cleanup slot and unsubscribe when instance ends', () => {
        const playId = scheduler.schedulePlay(mockInstance, 1 as ContextTime);

        expect(endedHandler).toBeDefined();
        endedHandler(mockInstance);

        expect(offSpy).toHaveBeenCalledTimes(1);

        scheduler.cancel(playId);
        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();
    });

    it('should clear instance from registry without calling cancelScheduled', () => {
        const id = scheduler.schedulePlay(mockInstance, 1 as ContextTime);

        scheduler.clearInstance(mockInstance);

        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();
        expect(offSpy).toHaveBeenCalledTimes(1);

        scheduler.cancel(id);
        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();
    });

    it('should support multiple concurrent instances and clear them independently', () => {
        const otherOff = vi.fn();
        const otherInstance = {
            ...mockInstance,
            on: vi.fn().mockReturnValue(otherOff),
            play: vi.fn(),
            cancelScheduled: vi.fn()
        };

        scheduler.schedulePlay(mockInstance, 1 as ContextTime);
        scheduler.schedulePlay(otherInstance, 1 as ContextTime);

        scheduler.clearInstance(mockInstance);
        expect(offSpy).toHaveBeenCalledTimes(1);
        expect(otherOff).not.toHaveBeenCalled();

        scheduler.cancelAll(otherInstance);
        expect(otherInstance.cancelScheduled).toHaveBeenCalled();
        expect(otherOff).toHaveBeenCalledTimes(1);
    });

    it('should handle capacity limit gracefully', () => {
        const smallScheduler = new PlaybackScheduler(mockContextManager, 1);

        const id1 = smallScheduler.schedulePlay(mockInstance, 1 as ContextTime);
        const id2 = smallScheduler.schedulePlay(mockInstance, 1 as ContextTime);

        expect(id1).toBe(1);
        expect(id2).toBe(-1);
    });
});
