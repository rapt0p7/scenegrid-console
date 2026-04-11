// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as workerTimers from 'worker-timers';

import { CullingRunner } from '../CullingRunner.js';

import type { ICullingArbiter, CullingContext } from '@domain/Culling/Ports/ICullingArbiter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { PlaybackId } from '@domain/Types/Branded.js';

vi.mock('worker-timers', () => ({
    setInterval: vi.fn(),
    clearInterval: vi.fn()
}));

describe('CullingRunner (Infrastructure Adapter)', () => {
    let mockArbiter: ICullingArbiter;
    let mockController: ISoundController;
    let mockContext: CullingContext;
    let runner: CullingRunner;

    beforeEach(() => {
        vi.clearAllMocks();

        mockArbiter = {
            evaluate: vi.fn().mockReturnValue({
                toVirtualize: [],
                toDevirtualize: []
            })
        };

        mockController = {
            virtualize: vi.fn(),
            devirtualize: vi.fn()
        } as unknown as ISoundController;

        mockContext = {} as CullingContext;

        runner = new CullingRunner(mockArbiter, mockController, mockContext, 500);
    });

    afterEach(() => {
        runner.stop();
    });

    // eslint-disable-next-line unicorn/consistent-function-scoping
    function triggerTick(): void {
        const tickCallback = vi.mocked(workerTimers.setInterval).mock.calls[0][0] as (...arguments_: any[]) => any;
        tickCallback();
    }

    it('should start and stop the worker timer correctly', () => {
        expect(workerTimers.setInterval).not.toHaveBeenCalled();

        runner.start();
        expect(workerTimers.setInterval).toHaveBeenCalledTimes(1);
        expect(workerTimers.setInterval).toHaveBeenCalledWith(expect.any(Function), 500);

        runner.start();
        expect(workerTimers.setInterval).toHaveBeenCalledTimes(1);

        runner.stop();
        expect(workerTimers.clearInterval).toHaveBeenCalledTimes(1);
    });

    it('should query the arbiter and dispatch virtualization commands to the controller', () => {
        vi.mocked(mockArbiter.evaluate).mockReturnValue({
            toVirtualize: [101 as PlaybackId, 102 as PlaybackId],
            toDevirtualize: []
        });

        runner.start();
        triggerTick();

        expect(mockArbiter.evaluate).toHaveBeenCalledWith(mockContext);

        expect(mockController.virtualize).toHaveBeenCalledTimes(2);
        expect(mockController.virtualize).toHaveBeenCalledWith(101);
        expect(mockController.virtualize).toHaveBeenCalledWith(102);

        expect(mockController.devirtualize).not.toHaveBeenCalled();
    });

    it('should query the arbiter and dispatch devirtualization commands to the controller', () => {
        vi.mocked(mockArbiter.evaluate).mockReturnValue({
            toVirtualize: [],
            toDevirtualize: [201 as PlaybackId]
        });

        runner.start();
        triggerTick();

        expect(mockArbiter.evaluate).toHaveBeenCalledWith(mockContext);

        expect(mockController.devirtualize).toHaveBeenCalledTimes(1);
        expect(mockController.devirtualize).toHaveBeenCalledWith(201);

        expect(mockController.virtualize).not.toHaveBeenCalled();
    });
});
