// oxlint-disable unicorn/no-useless-undefined
// noinspection D

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as workerTimers from 'worker-timers';

import { EngineTicker } from '@infrastructure/scheduling/EngineTicker.js';

import type { TickerTaskId } from '@scene-grid/shared';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';

vi.mock('worker-timers', () => ({
    setInterval: vi.fn(),
    clearInterval: vi.fn()
}));

describe('EngineTicker (Data-Oriented Pipeline)', () => {
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

    describe('Task Management (Flat Arrays & Swap and Pop)', () => {
        it('should prevent adding duplicate tasks', () => {
            const tickable: ITickable = { tick: vi.fn() };

            ticker.add('task1' as TickerTaskId, 30, tickable);
            ticker.add('task1' as TickerTaskId, 60, tickable);

            const tasks = (ticker as any).tasks;
            expect(tasks).toHaveLength(1);
            expect(tasks[0].intervalMs).toBe(30);
        });

        it('should add and remove tasks using O(1) Swap and Pop without allocations', () => {
            const tickable1: ITickable = { tick: vi.fn() };
            const tickable2: ITickable = { tick: vi.fn() };
            const tickable3: ITickable = { tick: vi.fn() };

            ticker.add('task1' as TickerTaskId, 30, tickable1);
            ticker.add('task2' as TickerTaskId, 30, tickable2);
            ticker.add('task3' as TickerTaskId, 30, tickable3);

            let tasks = (ticker as any).tasks;
            expect(tasks).toHaveLength(3);
            expect(tasks[1].id).toBe('task2');
            expect(tasks[2].id).toBe('task3');

            ticker.remove('task2' as TickerTaskId);

            tasks = (ticker as any).tasks;
            expect(tasks).toHaveLength(2);

            expect(tasks[1].id).toBe('task3');
            expect(tasks.find((t: any) => t.id === 'task2')).toBeUndefined();
        });

        it('should safely handle removal of non-existent tasks', () => {
            const tickable: ITickable = { tick: vi.fn() };
            ticker.add('task1' as TickerTaskId, 30, tickable);

            ticker.remove('ghost_task' as TickerTaskId);

            const tasks = (ticker as any).tasks;
            expect(tasks).toHaveLength(1);
        });
    });

    describe('Tick Logic and Accumulation', () => {
        it('should accumulate deltaTime and NOT fire target if interval is not reached', () => {
            const tickable: ITickable = { tick: vi.fn() };
            ticker.add('task1' as TickerTaskId, 30, tickable);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1015);
            capturedTick!();

            expect(tickable.tick).not.toHaveBeenCalled();

            const task = (ticker as any).tasks.find((t: any) => t.id === 'task1');
            expect(task.accumulator).toBe(15);
        });

        it('should fire target and subtract interval when accumulator reaches intervalMs', () => {
            const tickable: ITickable = { tick: vi.fn() };
            ticker.add('task1' as TickerTaskId, 30, tickable);
            mockGetContextTime.mockReturnValue(5.5);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1015);
            capturedTick!();

            vi.spyOn(performance, 'now').mockReturnValue(1030);
            capturedTick!();

            expect(tickable.tick).toHaveBeenCalledTimes(1);
            expect(tickable.tick).toHaveBeenCalledWith(5.5, 30);

            const task = (ticker as any).tasks.find((t: any) => t.id === 'task1');
            expect(task.accumulator).toBe(0);
        });

        it('should carry over remaining time in accumulator if deltaTime exceeds interval', () => {
            const tickable: ITickable = { tick: vi.fn() };
            ticker.add('task1' as TickerTaskId, 20, tickable);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1025);
            capturedTick!();

            expect(tickable.tick).toHaveBeenCalledTimes(1);

            const task = (ticker as any).tasks.find((t: any) => t.id === 'task1');
            expect(task.accumulator).toBe(5);
        });

        it('should process multiple tasks with different intervals independently in a flat loop', () => {
            const tickable1: ITickable = { tick: vi.fn() };
            const tickable2: ITickable = { tick: vi.fn() };

            ticker.add('fast' as TickerTaskId, 15, tickable1);
            ticker.add('slow' as TickerTaskId, 30, tickable2);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1015);
            capturedTick!();

            expect(tickable1.tick).toHaveBeenCalledTimes(1);
            expect(tickable2.tick).not.toHaveBeenCalled();

            vi.spyOn(performance, 'now').mockReturnValue(1030);
            capturedTick!();

            expect(tickable1.tick).toHaveBeenCalledTimes(2);
            expect(tickable2.tick).toHaveBeenCalledTimes(1);
        });
    });
});
