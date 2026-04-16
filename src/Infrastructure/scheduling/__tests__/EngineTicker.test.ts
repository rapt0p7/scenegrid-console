// noinspection D

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as workerTimers from 'worker-timers';

import { EngineTicker } from '@infrastructure/scheduling/EngineTicker.js';

vi.mock('worker-timers', () => ({
    setInterval: vi.fn(),
    clearInterval: vi.fn()
}));

describe('EngineTicker', () => {
    let ticker: EngineTicker;
    let mockGetContextTime: ReturnType<typeof vi.fn>;
    let capturedTick: (() => void) | null = null;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedTick = null;

        mockGetContextTime = vi.fn().mockReturnValue(0);

        vi.mocked(workerTimers.setInterval).mockImplementation(callback => {
            capturedTick = callback as () => void;
            return 999 as any;
        });

        vi.spyOn(performance, 'now').mockReturnValue(1000);

        ticker = new EngineTicker(mockGetContextTime as unknown as () => number);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Lifecycle: start and stop', () => {
        it('should start worker timer and set lastTickTime', () => {
            ticker.start();

            expect(workerTimers.setInterval).toHaveBeenCalledTimes(1);
            expect(workerTimers.setInterval).toHaveBeenCalledWith(expect.any(Function), 15);
            expect(capturedTick).not.toBeNull();
        });

        it('should ignore subsequent start calls if already running', () => {
            ticker.start();
            ticker.start();

            expect(workerTimers.setInterval).toHaveBeenCalledTimes(1);
        });

        it('should stop worker timer and clear tickerId', () => {
            ticker.start();
            ticker.stop();

            expect(workerTimers.clearInterval).toHaveBeenCalledTimes(1);
            expect(workerTimers.clearInterval).toHaveBeenCalledWith(999);
        });

        it('should do nothing on stop if not started', () => {
            ticker.stop();
            expect(workerTimers.clearInterval).not.toHaveBeenCalled();
        });
    });

    describe('Task Management', () => {
        it('should add and remove tasks without errors', () => {
            const callback = vi.fn();

            ticker.add('task1', 30, callback);
            expect((ticker as any).tasks.has('task1')).toBe(true);

            ticker.remove('task1');
            expect((ticker as any).tasks.has('task1')).toBe(false);
        });
    });

    describe('Tick Logic and Accumulation', () => {
        it('should accumulate deltaTime and NOT fire callback if interval is not reached', () => {
            const callback = vi.fn();
            ticker.add('task1', 30, callback);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1015);
            capturedTick!();

            expect(callback).not.toHaveBeenCalled();
            const task = (ticker as any).tasks.get('task1');
            expect(task.accumulator).toBe(15);
        });

        it('should fire callback and subtract interval when accumulator reaches intervalMs', () => {
            const callback = vi.fn();
            ticker.add('task1', 30, callback);
            mockGetContextTime.mockReturnValue(5.5);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1015);
            capturedTick!();

            vi.spyOn(performance, 'now').mockReturnValue(1030);
            capturedTick!();

            expect(callback).toHaveBeenCalledTimes(1);
            expect(callback).toHaveBeenCalledWith(5.5, 15);

            const task = (ticker as any).tasks.get('task1');
            expect(task.accumulator).toBe(0);
        });

        it('should carry over remaining time in accumulator if deltaTime exceeds interval', () => {
            const callback = vi.fn();
            ticker.add('task1', 20, callback);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1025);
            capturedTick!();

            expect(callback).toHaveBeenCalledTimes(1);

            const task = (ticker as any).tasks.get('task1');
            expect(task.accumulator).toBe(5);
        });

        it('should process multiple tasks with different intervals independently', () => {
            const callback1 = vi.fn();
            const callback2 = vi.fn();

            ticker.add('fast', 15, callback1);
            ticker.add('slow', 30, callback2);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1015);
            capturedTick!();

            expect(callback1).toHaveBeenCalledTimes(1);
            expect(callback2).not.toHaveBeenCalled();

            vi.spyOn(performance, 'now').mockReturnValue(1030);
            capturedTick!();

            expect(callback1).toHaveBeenCalledTimes(2);
            expect(callback2).toHaveBeenCalledTimes(1);
        });
    });
});
