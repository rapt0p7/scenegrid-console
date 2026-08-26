import { ISoundInstance, PlaybackScheduler } from '@infrastructure';
import { ContextTime, Seconds } from '@scene-grid/shared';
// noinspection D
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('PlaybackScheduler', () => {
    let mockContextManager: any;
    let scheduler: PlaybackScheduler;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContextManager = {
            context: {
                currentTime: 100
            }
        };

        scheduler = new PlaybackScheduler(mockContextManager, 128);
    });

    it('should schedule play accurately using absolute targetTime', () => {
        const mockInstance = createMockInstance();
        const targetTime = 102.5 as ContextTime;

        const id = scheduler.schedulePlay(mockInstance, targetTime, 1 as Seconds, 5 as Seconds);

        expect(id).toBe(1);
        expect(mockInstance.play).toHaveBeenCalledWith(targetTime, 1, 5);
        expect(mockInstance.on).toHaveBeenCalledWith('ended', expect.any(Function));
    });

    it('should fallback to context currentTime if targetTime is 0', () => {
        const mockInstance = createMockInstance();

        scheduler.schedulePlay(mockInstance, 0 as ContextTime, 1 as Seconds, 5 as Seconds);

        expect(mockInstance.play).toHaveBeenCalledWith(100, 1, 5);
    });

    it('should generate monotonically incrementing unique IDs across consecutive schedulePlay and scheduleStop calls', () => {
        const instanceA = createMockInstance();
        const instanceB = createMockInstance();

        const id1 = scheduler.schedulePlay(instanceA, 10 as ContextTime);
        const id2 = scheduler.schedulePlay(instanceB, 20 as ContextTime);
        const id3 = scheduler.scheduleStop(instanceA, 30 as ContextTime);
        const id4 = scheduler.scheduleStop(instanceB, 40 as ContextTime);

        expect(id1).toBe(1);
        expect(id2).toBe(2);
        expect(id3).toBe(3);
        expect(id4).toBe(4);
    });

    it('should schedule stop by passing relative delay to instance', () => {
        const mockInstance = createMockInstance();

        const id = scheduler.scheduleStop(mockInstance, 5 as ContextTime);

        expect(id).toBe(1);
        expect(mockInstance.stop).toHaveBeenCalledWith(5);
    });

    it('should schedule stop for an actively playing instance in any slot', () => {
        const instanceA = createMockInstance();
        const instanceB = createMockInstance();

        scheduler.schedulePlay(instanceA, 10 as ContextTime);
        scheduler.schedulePlay(instanceB, 20 as ContextTime);

        const stopIdA = scheduler.scheduleStop(instanceA, 15 as ContextTime);
        const stopIdB = scheduler.scheduleStop(instanceB, 25 as ContextTime);

        expect(instanceA.stop).toHaveBeenCalledWith(15);
        expect(instanceB.stop).toHaveBeenCalledWith(25);
        expect(stopIdA).toBe(3);
        expect(stopIdB).toBe(4);
    });

    it('should record stop times for active instances across slots and return null for unscheduled instances', () => {
        const instanceA = createMockInstance();
        const instanceB = createMockInstance();
        const unregistered = createMockInstance();

        scheduler.schedulePlay(instanceA, 10 as ContextTime);
        scheduler.schedulePlay(instanceB, 20 as ContextTime);

        scheduler.scheduleStop(instanceA, 15 as ContextTime);
        scheduler.scheduleStop(instanceB, 25 as ContextTime);
        scheduler.scheduleStop(unregistered, 50 as ContextTime);

        expect(scheduler.getScheduledStopTime(instanceA)).toBe(15);
        expect(scheduler.getScheduledStopTime(instanceB)).toBe(25);
        expect(scheduler.getScheduledStopTime(unregistered)).toBeNull();
    });

    it('should cancel a specific scheduled event by ID', () => {
        const offSpy = vi.fn();
        const mockInstance = createMockInstance({ on: vi.fn().mockReturnValue(offSpy) });
        const playId = scheduler.schedulePlay(mockInstance, 2 as ContextTime);

        scheduler.cancel(playId);
        expect(mockInstance.cancelScheduled).toHaveBeenCalledTimes(1);
        expect(offSpy).toHaveBeenCalledTimes(1);

        scheduler.cancel(playId);
        expect(mockInstance.cancelScheduled).toHaveBeenCalledTimes(1);
    });

    it('should cancel ALL events for a specific instance', () => {
        const offSpy = vi.fn();
        const mockInstance = createMockInstance({ on: vi.fn().mockReturnValue(offSpy) });

        scheduler.schedulePlay(mockInstance, 1 as ContextTime);
        scheduler.schedulePlay(mockInstance, 2 as ContextTime);

        scheduler.cancelAll(mockInstance);

        expect(mockInstance.cancelScheduled).toHaveBeenCalledTimes(2);
        expect(offSpy).toHaveBeenCalledTimes(2);
    });

    it('should auto-cleanup slot and unsubscribe when instance ends', () => {
        let endedHandler: any;
        const offSpy = vi.fn();
        const mockInstance = createMockInstance({
            on: vi.fn().mockImplementation((event, handler) => {
                if (event === 'ended') endedHandler = handler;
                return offSpy;
            })
        });

        const playId = scheduler.schedulePlay(mockInstance, 1 as ContextTime);

        expect(endedHandler).toBeDefined();
        endedHandler(mockInstance);

        expect(offSpy).toHaveBeenCalledTimes(1);

        scheduler.cancel(playId);
        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();
    });

    it('should cleanup slot and unsubscribe when an instance occupying a non-zero slot ends', () => {
        let endedHandlerB: ((instance: any) => void) | undefined;
        const offSpyA = vi.fn();
        const offSpyB = vi.fn();

        const instanceA = createMockInstance({ on: vi.fn().mockReturnValue(offSpyA) });
        const instanceB = createMockInstance({
            on: vi.fn().mockImplementation((event, handler) => {
                if (event === 'ended') endedHandlerB = handler;
                return offSpyB;
            })
        });

        scheduler.schedulePlay(instanceA, 10 as ContextTime);
        const idB = scheduler.schedulePlay(instanceB, 20 as ContextTime);

        expect(endedHandlerB).toBeDefined();
        endedHandlerB!(instanceB);

        expect(offSpyB).toHaveBeenCalledTimes(1);
        expect(offSpyA).not.toHaveBeenCalled();

        scheduler.cancel(idB);
        expect(instanceB.cancelScheduled).not.toHaveBeenCalled();
    });

    it('should clear instance from registry without calling cancelScheduled', () => {
        const offSpy = vi.fn();
        const mockInstance = createMockInstance({ on: vi.fn().mockReturnValue(offSpy) });
        const id = scheduler.schedulePlay(mockInstance, 1 as ContextTime);

        scheduler.clearInstance(mockInstance);

        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();
        expect(offSpy).toHaveBeenCalledTimes(1);

        scheduler.cancel(id);
        expect(mockInstance.cancelScheduled).not.toHaveBeenCalled();
    });

    it('should clear an instance in a non-zero slot without affecting other active slots', () => {
        const offSpyA = vi.fn();
        const offSpyB = vi.fn();
        const instanceA = createMockInstance({ on: vi.fn().mockReturnValue(offSpyA) });
        const instanceB = createMockInstance({ on: vi.fn().mockReturnValue(offSpyB) });

        const idA = scheduler.schedulePlay(instanceA, 10 as ContextTime);
        const idB = scheduler.schedulePlay(instanceB, 20 as ContextTime);

        scheduler.clearInstance(instanceB);

        expect(offSpyB).toHaveBeenCalledTimes(1);
        expect(offSpyA).not.toHaveBeenCalled();

        scheduler.cancel(idB);
        expect(instanceB.cancelScheduled).not.toHaveBeenCalled();

        scheduler.cancel(idA);
        expect(instanceA.cancelScheduled).toHaveBeenCalledTimes(1);
    });

    it('should safely no-op and not disturb active slots when clearInstance or onInstanceEnded is called with an unregistered instance', () => {
        const offSpy0 = vi.fn();
        const offSpy1 = vi.fn();

        let endedHandler0: any;
        const instance0 = createMockInstance({
            on: vi.fn().mockImplementation((event, handler) => {
                if (event === 'ended') endedHandler0 = handler;
                return offSpy0;
            })
        });
        const instance1 = createMockInstance({ on: vi.fn().mockReturnValue(offSpy1) });
        const unregisteredInstance = createMockInstance();

        const id0 = scheduler.schedulePlay(instance0, 10 as ContextTime);
        const id1 = scheduler.schedulePlay(instance1, 20 as ContextTime);

        scheduler.clearInstance(unregisteredInstance);

        expect(offSpy1).not.toHaveBeenCalled();
        expect(offSpy0).not.toHaveBeenCalled();

        endedHandler0(unregisteredInstance);

        expect(offSpy1).not.toHaveBeenCalled();
        expect(offSpy0).not.toHaveBeenCalled();

        scheduler.cancel(id0);
        scheduler.cancel(id1);

        expect(instance0.cancelScheduled).toHaveBeenCalledTimes(1);
        expect(instance1.cancelScheduled).toHaveBeenCalledTimes(1);
    });

    it('should delete active handles on slot cleanup so stale IDs cannot cancel newly scheduled instances reusing the slot', () => {
        const instanceA = createMockInstance();
        const instanceB = createMockInstance();
        const instanceC = createMockInstance();

        const idA = scheduler.schedulePlay(instanceA, 10 as ContextTime);
        const idB = scheduler.schedulePlay(instanceB, 20 as ContextTime);

        scheduler.clearInstance(instanceA);

        const idC = scheduler.schedulePlay(instanceC, 30 as ContextTime);

        scheduler.cancel(idA);

        expect(instanceC.cancelScheduled).not.toHaveBeenCalled();

        scheduler.cancel(idB);
        scheduler.cancel(idC);

        expect(instanceB.cancelScheduled).toHaveBeenCalledTimes(1);
        expect(instanceC.cancelScheduled).toHaveBeenCalledTimes(1);
    });

    it('should handle capacity limit gracefully', () => {
        const smallScheduler = new PlaybackScheduler(mockContextManager, 1);
        const mockInstance = createMockInstance();

        const id1 = smallScheduler.schedulePlay(mockInstance, 1 as ContextTime);
        const id2 = smallScheduler.schedulePlay(mockInstance, 1 as ContextTime);

        expect(id1).toBe(1);
        expect(id2).toBe(-1);
    });

    it('should safely handle undefined or non-instance values in cancelAll without out-of-bounds execution', () => {
        const instance0 = createMockInstance();
        scheduler.schedulePlay(instance0, 10 as ContextTime);

        expect(() => {
            scheduler.cancelAll(undefined as any);
        }).not.toThrow();

        expect(instance0.cancelScheduled).not.toHaveBeenCalled();
    });
});

type MockSoundInstance = {
    play: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    cancelScheduled: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    [key: string]: any;
};

function createMockInstance(overrides?: Partial<MockSoundInstance>): ISoundInstance {
    return {
        play: vi.fn(),
        stop: vi.fn(),
        cancelScheduled: vi.fn(),
        on: vi.fn().mockReturnValue(vi.fn()),
        ...overrides
    } as unknown as ISoundInstance;
}
