// noinspection D
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CullingRunner } from '../CullingRunner.js';

import type { ICullingArbiter, ICullingContext } from '@domain/Culling/Ports/ICullingArbiter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { PlaybackId } from '@shared/Types/Branded.js';

describe('CullingRunner (Infrastructure Adapter)', () => {
    let mockArbiter: ICullingArbiter;
    let mockController: ISoundController;
    let mockContext: ICullingContext;
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

        mockContext = {} as ICullingContext;

        runner = new CullingRunner(mockArbiter, mockController, mockContext);
    });

    it('should query the arbiter with deltaTime and dispatch virtualization commands to the controller', () => {
        vi.mocked(mockArbiter.evaluate).mockReturnValue({
            toVirtualize: [101 as PlaybackId, 102 as PlaybackId],
            toDevirtualize: []
        });

        runner.tick(10.5, 500);

        expect(mockArbiter.evaluate).toHaveBeenCalledWith(mockContext, 500);

        expect(mockController.virtualize).toHaveBeenCalledTimes(2);
        expect(mockController.virtualize).toHaveBeenCalledWith(101);
        expect(mockController.virtualize).toHaveBeenCalledWith(102);

        expect(mockController.devirtualize).not.toHaveBeenCalled();
    });

    it('should query the arbiter with deltaTime and dispatch devirtualization commands to the controller', () => {
        vi.mocked(mockArbiter.evaluate).mockReturnValue({
            toVirtualize: [],
            toDevirtualize: [201 as PlaybackId]
        });

        runner.tick(12.0, 0);

        expect(mockArbiter.evaluate).toHaveBeenCalledWith(mockContext, 0);

        expect(mockController.devirtualize).toHaveBeenCalledTimes(1);
        expect(mockController.devirtualize).toHaveBeenCalledWith(201);

        expect(mockController.virtualize).not.toHaveBeenCalled();
    });
});
