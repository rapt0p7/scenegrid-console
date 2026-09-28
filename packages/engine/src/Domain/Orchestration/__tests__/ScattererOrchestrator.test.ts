import type { IScattererSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type ContainerPlaybackPolicy from '@domain/Managers/ContainerPlaybackPolicy.js';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { PlaybackId, SoundId, IPRNG, Milliseconds, ContextTime } from '@scene-grid/shared';
import type { Mocked } from 'vitest';

import { ScattererOrchestrator } from '@domain/Orchestration/ScattererOrchestrator.js';
/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ScattererOrchestrator', () => {
    let mockRouter: Mocked<IAudioRouter>;
    let mockController: Mocked<ISoundController>;
    let mockSequencer: Mocked<ISequencer>;
    let mockPolicy: Mocked<ContainerPlaybackPolicy>;
    let mockPrng: Mocked<IPRNG>;
    let orchestrator: ScattererOrchestrator;

    const dummyConfig: IScattererSoundConfig = {
        isScatterer: true,
        sources: ['bird_chirp' as SoundId],
        spawnRate: [1000 as Milliseconds, 2000 as Milliseconds],
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

        mockPrng = {
            next: vi.fn().mockReturnValue(0.5),
            nextRange: vi.fn().mockImplementation((min, max) => min + 0.5 * (max - min))
        };

        orchestrator = new ScattererOrchestrator(mockRouter, mockController, mockSequencer, mockPolicy, mockPrng);
    });

    describe('Lifecycle and State Management', () => {
        it('should initialize a session and calculate first spawn time', () => {
            orchestrator.start(99 as PlaybackId, dummyConfig, 5 as ContextTime);

            const sessions = (orchestrator as any).activeSessions;
            expect(sessions).toHaveLength(1);
            expect(sessions[0].playbackId).toBe(99);
            expect(sessions[0].nextSpawnTime).toBe(6500);
            expect(sessions[0].spawnedPlaybacks.length).toBe(dummyConfig.maxPolyphony);
            expect(sessions[0].spawnCount).toBe(0);
        });

        it('should remove session (Swap and Pop) if logicalState is undefined (stopped/destroyed)', () => {
            orchestrator.start(99 as PlaybackId, dummyConfig, 0 as ContextTime);
            // oxlint-disable-next-line unicorn/no-useless-undefined
            mockController.getLogicalState.mockReturnValue(undefined);

            orchestrator.tick(100 as ContextTime, 16 as Milliseconds);

            const sessions = (orchestrator as any).activeSessions;
            expect(sessions).toHaveLength(0);
        });

        it('should accumulate deltaTime when paused to prevent Time Debt', () => {
            orchestrator.start(99 as PlaybackId, dummyConfig, 0 as ContextTime);
            const initialSpawnTime = (orchestrator as any).activeSessions[0].nextSpawnTime;

            mockController.getLogicalState.mockReturnValue('paused');

            orchestrator.tick(100 as ContextTime, 100 as Milliseconds);

            const updatedSpawnTime = (orchestrator as any).activeSessions[0].nextSpawnTime;

            expect(updatedSpawnTime).toBe(initialSpawnTime + 100);
        });
    });

    describe('Spawning Logic (Hot Path)', () => {
        beforeEach(() => {
            orchestrator.start(99 as PlaybackId, dummyConfig, 0 as ContextTime);
            mockController.getLogicalState.mockReturnValue('playing');
            mockPolicy.evaluateNext.mockReturnValue({ soundId: 'bird_chirp' as SoundId, nextState: {} as any });
            mockRouter.play.mockReturnValue(100);
        });

        it('should not spawn if currentTime is less than nextSpawnTime', () => {
            orchestrator.tick(1 as ContextTime, 16 as Milliseconds);

            expect(mockRouter.play).not.toHaveBeenCalled();
        });

        it('should spawn, calculate 3D position, track polyphony, and reschedule when time is reached', () => {
            orchestrator.tick(1.5 as ContextTime, 16 as Milliseconds);

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

            expect(session.nextSpawnTime).toBe(3000);
        });

        it('should block spawn if maxPolyphony is reached', () => {
            const session = (orchestrator as any).activeSessions[0];
            session.spawnCount = 2;

            orchestrator.tick(1.5 as ContextTime, 16 as Milliseconds);

            expect(mockRouter.play).not.toHaveBeenCalled();

            expect(session.nextSpawnTime).toBe(3000);
        });

        it('should skip 3D position calculation if scatterDistance is undefined', () => {
            const no3dConfig: IScattererSoundConfig = {
                isScatterer: true,
                sources: ['bird_chirp' as SoundId],
                spawnRate: [1000 as Milliseconds, 2000 as Milliseconds],
                maxPolyphony: 2
            };

            orchestrator.start(101 as PlaybackId, no3dConfig, 0 as ContextTime);
            const session = (orchestrator as any).activeSessions[1];

            session.nextSpawnTime = 0;

            orchestrator.tick(0 as ContextTime, 16 as Milliseconds);

            expect(mockController.setPosition).toHaveBeenCalledWith(100, 0, 0, 0);
        });
    });

    describe('Zero-Allocation Cleanup (Swap and Pop)', () => {
        it('should remove dead voices and correctly decrease spawnCount', () => {
            orchestrator.start(99 as PlaybackId, dummyConfig, 0 as ContextTime);
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

            const mockGrid = { getNextBeatTime: vi.fn().mockReturnValue(2) };
            mockSequencer.getPlaybackInfo.mockReturnValue({ grid: mockGrid } as any);

            orchestrator.start(99 as PlaybackId, syncConfig, 0 as ContextTime);

            const session = (orchestrator as any).activeSessions[0];

            expect(mockSequencer.getPlaybackInfo).toHaveBeenCalledWith('bgm');
            expect(mockGrid.getNextBeatTime).toHaveBeenCalledWith(1.5);
            expect(session.nextSpawnTime).toBe(2000);
        });
    });
});
