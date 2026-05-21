/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScattererOrchestrator } from '@domain/Orchestration/ScattererOrchestrator.js';

import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type ContainerPlaybackPolicy from '@domain/Managers/ContainerPlaybackPolicy.js';
import type { IScattererSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { PlaybackId, SoundId } from '@shared/Types/Branded.js';
import type { Mocked } from 'vitest';

describe('ScattererOrchestrator', () => {
    let mockRouter: Mocked<IAudioRouter>;
    let mockController: Mocked<ISoundController>;
    let mockSequencer: Mocked<ISequencer>;
    let mockPolicy: Mocked<ContainerPlaybackPolicy>;
    let orchestrator: ScattererOrchestrator;
    let mathRandomSpy: ReturnType<typeof vi.spyOn>;

    const dummyConfig: IScattererSoundConfig = {
        isScatterer: true,
        sources: ['bird_chirp' as SoundId],
        spawnRateMs: [1000, 2000],
        scatterDistance: [10, 30],
        maxPolyphony: 2
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mockRouter = { play: vi.fn() } as unknown as Mocked<IAudioRouter>;
        mockController = {
            getLogicalState: vi.fn(),
            getPlaybackState: vi.fn(),
            setPosition: vi.fn()
        } as unknown as Mocked<ISoundController>;

        mockSequencer = { getPlaybackInfo: vi.fn() } as unknown as Mocked<ISequencer>;
        mockPolicy = { evaluateNext: vi.fn() } as unknown as Mocked<ContainerPlaybackPolicy>;

        mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

        orchestrator = new ScattererOrchestrator(mockRouter, mockController, mockSequencer, mockPolicy);
    });

    afterEach(() => {
        mathRandomSpy.mockRestore();
    });

    describe('Lifecycle and State Management', () => {
        it('should initialize a session and calculate first spawn time', () => {
            orchestrator.start(99 as PlaybackId, dummyConfig, 5000);

            const sessions = (orchestrator as any).activeSessions;
            expect(sessions).toHaveLength(1);
            expect(sessions[0].playbackId).toBe(99);
            expect(sessions[0].nextSpawnTimeMs).toBe(6500);
            expect(sessions[0].spawnedPlaybacks.length).toBe(dummyConfig.maxPolyphony);
            expect(sessions[0].spawnCount).toBe(0);
        });

        it('should remove session (Swap and Pop) if logicalState is undefined (stopped/destroyed)', () => {
            orchestrator.start(99 as PlaybackId, dummyConfig, 0);
            // oxlint-disable-next-line unicorn/no-useless-undefined
            mockController.getLogicalState.mockReturnValue(undefined);

            orchestrator.tick(100, 16);

            const sessions = (orchestrator as any).activeSessions;
            expect(sessions).toHaveLength(0);
        });

        it('should accumulate deltaTime when paused to prevent Time Debt', () => {
            orchestrator.start(99 as PlaybackId, dummyConfig, 0);
            const initialSpawnTime = (orchestrator as any).activeSessions[0].nextSpawnTimeMs;

            mockController.getLogicalState.mockReturnValue('paused');

            orchestrator.tick(100, 100);

            const updatedSpawnTime = (orchestrator as any).activeSessions[0].nextSpawnTimeMs;

            expect(updatedSpawnTime).toBe(initialSpawnTime + 100);
        });
    });

    describe('Spawning Logic (Hot Path)', () => {
        beforeEach(() => {
            orchestrator.start(99 as PlaybackId, dummyConfig, 0);
            mockController.getLogicalState.mockReturnValue('playing');
            mockPolicy.evaluateNext.mockReturnValue({ soundId: 'bird_chirp' as SoundId, nextState: {} as any });
            mockRouter.play.mockReturnValue(100 as PlaybackId);
        });

        it('should not spawn if currentTime is less than nextSpawnTimeMs', () => {
            orchestrator.tick(1, 16);

            expect(mockRouter.play).not.toHaveBeenCalled();
        });

        it('should spawn, calculate 3D position, track polyphony, and reschedule when time is reached', () => {
            orchestrator.tick(1.5, 16);

            expect(mockPolicy.evaluateNext).toHaveBeenCalledWith(
                expect.objectContaining({
                    isContainer: true,
                    mode: 'random_no_repeat',
                    sources: dummyConfig.sources
                })
            );

            expect(mockRouter.play).toHaveBeenCalledWith('bird_chirp');

            expect(mockController.setPosition).toHaveBeenCalledWith(100, -20, 0, expect.closeTo(0, 10));

            const session = (orchestrator as any).activeSessions[0];
            expect(session.spawnCount).toBe(1);
            expect(session.spawnedPlaybacks[0]).toBe(100);

            expect(session.nextSpawnTimeMs).toBe(3000);
        });

        it('should block spawn if maxPolyphony is reached', () => {
            const session = (orchestrator as any).activeSessions[0];
            session.spawnCount = 2;

            orchestrator.tick(1.5, 16);

            expect(mockRouter.play).not.toHaveBeenCalled();
            expect(session.nextSpawnTimeMs).toBe(3000);
        });
    });

    describe('Zero-Allocation Cleanup (Swap and Pop)', () => {
        it('should remove dead voices and correctly decrease spawnCount', () => {
            orchestrator.start(99 as PlaybackId, dummyConfig, 0);
            const session = (orchestrator as any).activeSessions[0];

            session.spawnedPlaybacks[0] = 101 as PlaybackId;
            session.spawnedPlaybacks[1] = 102 as PlaybackId;
            session.spawnCount = 2;

            mockController.getPlaybackState.mockImplementation(id => {
                if (id === 101) return 'stopped';
                return 'playing';
            });

            (orchestrator as any).cleanupDeadVoices(session);

            expect(session.spawnCount).toBe(1);
            expect(session.spawnedPlaybacks[0]).toBe(102);
        });
    });

    describe('Musical Quantization (Sequencer Sync)', () => {
        it('should ask Sequencer for grid and snap spawn time', () => {
            const syncConfig: IScattererSoundConfig = {
                ...dummyConfig,
                sync: { quantize: 'NextBeat', referenceTrackId: 'bgm' as SoundId }
            };

            const mockGrid = { getNextBeatTime: vi.fn().mockReturnValue(2000) };
            mockSequencer.getPlaybackInfo.mockReturnValue({ grid: mockGrid } as any);

            orchestrator.start(99 as PlaybackId, syncConfig, 0);

            const session = (orchestrator as any).activeSessions[0];

            expect(mockSequencer.getPlaybackInfo).toHaveBeenCalledWith('bgm');
            expect(mockGrid.getNextBeatTime).toHaveBeenCalledWith(1500);
            expect(session.nextSpawnTimeMs).toBe(2000);
        });
    });
});
