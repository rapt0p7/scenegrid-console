// noinspection D
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CullingRunner } from '../CullingRunner.js';

import type { ICullingArbiter, ICullingContext, CullingDecisions } from '@domain/Culling/Ports/ICullingArbiter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { Milliseconds, PlaybackId } from '@scene-grid/shared';

describe('CullingRunner (Infrastructure Adapter)', () => {
    let mockArbiter: ICullingArbiter;
    let mockController: ISoundController;
    let mockContext: ICullingContext;
    let mockTelemetry: ITelemetryDispatcher;
    let runner: CullingRunner;

    beforeEach(() => {
        vi.clearAllMocks();

        mockArbiter = {
            evaluate: vi.fn().mockReturnValue({
                toVirtualize: [],
                virtualizeCount: 0,
                toDevirtualize: [],
                devirtualizeCount: 0
            } as CullingDecisions)
        };

        mockController = {
            virtualize: vi.fn(),
            devirtualize: vi.fn(),
            getCurrentTime: vi.fn().mockReturnValue(12.5)
        } as unknown as ISoundController;

        mockTelemetry = {
            dispatch: vi.fn()
        } as unknown as ITelemetryDispatcher;

        mockContext = {} as ICullingContext;

        runner = new CullingRunner(mockArbiter, mockController, mockContext, mockTelemetry);
    });

    it('should query the arbiter with deltaTime and dispatch virtualization commands and telemetry', () => {
        vi.mocked(mockArbiter.evaluate).mockReturnValue({
            toVirtualize: [
                { playbackId: 101 as PlaybackId, reason: 'DEAF_BUS' },
                { playbackId: 102 as PlaybackId, reason: 'DEAF_BUS' }
            ],
            virtualizeCount: 2,
            toDevirtualize: [],
            devirtualizeCount: 0
        } as unknown as CullingDecisions);

        runner.tick(10.5, 500 as Milliseconds);

        expect(mockArbiter.evaluate).toHaveBeenCalledWith(mockContext, 500);

        expect(mockController.virtualize).toHaveBeenCalledTimes(2);
        expect(mockController.virtualize).toHaveBeenCalledWith(101, 'DEAF_BUS');
        expect(mockController.virtualize).toHaveBeenCalledWith(102, 'DEAF_BUS');

        expect(mockTelemetry.dispatch).toHaveBeenCalledTimes(2);
        expect(mockTelemetry.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'CAUSE_CHAIN',
                initiator: { type: 'CULLING_ARBITER', reason: 'DEAF_BUS' },
                result: { type: 'VIRTUALIZE', target: 101 }
            })
        );

        expect(mockController.devirtualize).not.toHaveBeenCalled();
    });

    it('should query the arbiter with deltaTime and dispatch devirtualization commands to the controller', () => {
        vi.mocked(mockArbiter.evaluate).mockReturnValue({
            toVirtualize: [],
            virtualizeCount: 0,
            toDevirtualize: [201 as PlaybackId],
            devirtualizeCount: 1
        } as unknown as CullingDecisions);

        runner.tick(12.0, 0 as Milliseconds);

        expect(mockArbiter.evaluate).toHaveBeenCalledWith(mockContext, 0);

        expect(mockController.devirtualize).toHaveBeenCalledTimes(1);
        expect(mockController.devirtualize).toHaveBeenCalledWith(201);

        expect(mockController.virtualize).not.toHaveBeenCalled();
    });
});
