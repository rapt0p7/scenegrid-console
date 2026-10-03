// oxlint-disable unicorn/no-useless-undefined
// noinspection D

import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { ContextTime, TickerTaskId } from '@scene-grid/shared';

import { EngineTicker } from '@infrastructure/scheduling/EngineTicker.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as workerTimers from 'worker-timers';

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
            return 999;
        });

        vi.spyOn(performance, 'now').mockReturnValue(1000);

        ticker = new EngineTicker(mockGetContextTime as unknown as () => ContextTime);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Lifecycle: start and stop', () => {
        it('should start worker timer with 16ms base rate and initialize state', () => {
            ticker.start();

            expect(workerTimers.setInterval).toHaveBeenCalledTimes(1);
            expect(workerTimers.setInterval).toHaveBeenCalledWith(expect.any(Function), 10);
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

        it('should update lastRunTime for all tasks when started', () => {
            const tickable: ITickable = { tick: vi.fn() };
            vi.spyOn(performance, 'now').mockReturnValue(100);
            ticker.add('task1' as TickerTaskId, 1, tickable);

            vi.spyOn(performance, 'now').mockReturnValue(500);
            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(510);
            capturedTick!();

            expect(tickable.tick).toHaveBeenCalledWith(0, 10);
        });
    });

    describe('Task Management (Flat Arrays & Swap and Pop)', () => {
        it('should prevent adding duplicate tasks', () => {
            const tickable: ITickable = { tick: vi.fn() };

            ticker.add('task1' as TickerTaskId, 2, tickable);
            ticker.add('task1' as TickerTaskId, 4, tickable);

            const tasks = (ticker as any).tasks;
            expect(tasks).toHaveLength(1);
            expect(tasks[0].divider).toBe(2);
        });

        it('should add and remove tasks using O(1) Swap and Pop without allocations', () => {
            const tickable1: ITickable = { tick: vi.fn() };
            const tickable2: ITickable = { tick: vi.fn() };
            const tickable3: ITickable = { tick: vi.fn() };

            ticker.add('task1' as TickerTaskId, 2, tickable1);
            ticker.add('task2' as TickerTaskId, 2, tickable2);
            ticker.add('task3' as TickerTaskId, 2, tickable3);

            let tasks = (ticker as any).tasks;
            expect(tasks).toHaveLength(3);
            expect(tasks[1].id).toBe('task2');
            expect(tasks[2].id).toBe('task3');

            ticker.remove('task2');

            tasks = (ticker as any).tasks;
            expect(tasks).toHaveLength(2);

            expect(tasks[1].id).toBe('task3');
            expect(tasks.find((t: any) => t.id === 'task2')).toBeUndefined();
        });

        it('should safely handle removal of non-existent tasks', () => {
            const tickable: ITickable = { tick: vi.fn() };
            ticker.add('task1' as TickerTaskId, 2, tickable);

            ticker.remove('ghost_task');

            const tasks = (ticker as any).tasks;
            expect(tasks).toHaveLength(1);
        });

        it('should sanitize and enforce minimum integer dividers', () => {
            const tickable: ITickable = { tick: vi.fn() };

            ticker.add('task1' as TickerTaskId, 0.4, tickable);
            ticker.add('task2' as TickerTaskId, 2.7, tickable);
            ticker.add('task3' as TickerTaskId, -5, tickable);

            const tasks = (ticker as any).tasks;
            expect(tasks.find((t: any) => t.id === 'task1').divider).toBe(1);
            expect(tasks.find((t: any) => t.id === 'task2').divider).toBe(3);
            expect(tasks.find((t: any) => t.id === 'task3').divider).toBe(1);
        });
    });

    describe('Tick Logic and Batching (Dividers)', () => {
        it('should early return and not evaluate time if there are no tasks', () => {
            ticker.start();
            mockGetContextTime.mockClear();

            capturedTick!();

            expect(mockGetContextTime).not.toHaveBeenCalled();
        });

        it('should NOT fire target if currentTick is not a multiple of task divider', () => {
            const tickable: ITickable = { tick: vi.fn() };
            ticker.add('task1' as TickerTaskId, 3, tickable);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1016);
            capturedTick!();

            vi.spyOn(performance, 'now').mockReturnValue(1032);
            capturedTick!();

            expect(tickable.tick).not.toHaveBeenCalled();
        });

        it('should fire target with exact time delta when currentTick aligns with divider', () => {
            const tickable: ITickable = { tick: vi.fn() };
            ticker.add('task1' as TickerTaskId, 2, tickable);
            mockGetContextTime.mockReturnValue(5.5);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1010);
            capturedTick!();

            vi.spyOn(performance, 'now').mockReturnValue(1020);
            capturedTick!();

            expect(tickable.tick).toHaveBeenCalledTimes(1);
            expect(tickable.tick).toHaveBeenCalledWith(5.5, 20);

            const task = (ticker as any).tasks.find((t: any) => t.id === 'task1');
            expect(task.lastRunTime).toBe(1020);
        });

        it('should process multiple tasks with different dividers in deterministic batches', () => {
            const tickable1: ITickable = { tick: vi.fn() };
            const tickable2: ITickable = { tick: vi.fn() };

            ticker.add('fast' as TickerTaskId, 1, tickable1);
            ticker.add('slow' as TickerTaskId, 3, tickable2);

            ticker.start();

            vi.spyOn(performance, 'now').mockReturnValue(1010);
            capturedTick!();

            expect(tickable1.tick).toHaveBeenCalledTimes(1);
            expect(tickable1.tick).toHaveBeenLastCalledWith(0, 10);
            expect(tickable2.tick).not.toHaveBeenCalled();

            vi.spyOn(performance, 'now').mockReturnValue(1020);
            capturedTick!();

            expect(tickable1.tick).toHaveBeenCalledTimes(2);
            expect(tickable1.tick).toHaveBeenLastCalledWith(0, 10);
            expect(tickable2.tick).not.toHaveBeenCalled();

            vi.spyOn(performance, 'now').mockReturnValue(1030);
            capturedTick!();

            expect(tickable1.tick).toHaveBeenCalledTimes(3);
            expect(tickable1.tick).toHaveBeenLastCalledWith(0, 10);
            expect(tickable2.tick).toHaveBeenCalledTimes(1);
            expect(tickable2.tick).toHaveBeenLastCalledWith(0, 30);
        });
    });
});
