import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as workerTimers from 'worker-timers';

import { VoiceCullingSystem } from '@domain/Culling/VoiceCullingSystem.js';

import type { ISoundController, PlaybackState } from '@domain/Shared/Ports/ISoundController.js';
import type { BusId, PlaybackId } from '@domain/Types/Branded.js';
import type { Mocked } from 'vitest';

vi.mock('worker-timers', () => ({
    setInterval: vi.fn(),
    clearInterval: vi.fn()
}));

describe('VoiceCullingSystem (Background Optimizer)', () => {
    let mockController: Mocked<ISoundController>;
    let mockBusVolumes: Record<string, number>;
    let mockSoundRouting: Record<string, BusId>;
    let cullingSystem: VoiceCullingSystem;

    let playbackStates: Map<PlaybackId, PlaybackState>;
    let playbackSounds: Map<PlaybackId, string>;

    beforeEach(() => {
        vi.clearAllMocks();

        playbackStates = new Map();
        playbackSounds = new Map();

        mockBusVolumes = {
            music: 1,
            sfx: 1
        };

        mockSoundRouting = {
            violins: 'music' as BusId,
            explosion: 'sfx' as BusId
        };

        mockController = {
            getActivePlaybacks: vi.fn(() => [...playbackStates.keys()]),
            getSoundId: vi.fn((id: PlaybackId) => playbackSounds.get(id)),
            getPlaybackState: vi.fn((id: PlaybackId) => playbackStates.get(id) || 'stopped'),
            virtualize: vi.fn((id: PlaybackId) => {
                playbackStates.set(id, 'virtual');
            }),
            devirtualize: vi.fn((id: PlaybackId) => {
                playbackStates.set(id, 'playing');
            })
        } as unknown as Mocked<ISoundController>;

        cullingSystem = new VoiceCullingSystem(mockController, {
            checkIntervalMs: 500,
            cullingThreshold: 0.01,
            busIdResolver: soundId => mockSoundRouting[soundId],
            busVolumeResolver: busId => mockBusVolumes[busId] ?? 1
        });
    });

    afterEach(() => {
        cullingSystem.stop();
    });

    // eslint-disable-next-line unicorn/consistent-function-scoping
    function triggerTick(): void {
        const tickCallback = vi.mocked(workerTimers.setInterval).mock.calls[0][0] as (...arguments_: any[]) => any;
        tickCallback();
    }

    function addMockPlayback(id: number, soundId: string, state: PlaybackState): PlaybackId {
        const pId = id as PlaybackId;
        playbackSounds.set(pId, soundId);
        playbackStates.set(pId, state);
        return pId;
    }

    it('should properly start and stop the worker timer', () => {
        expect(workerTimers.setInterval).not.toHaveBeenCalled();

        cullingSystem.start();
        expect(workerTimers.setInterval).toHaveBeenCalledTimes(1);
        expect(workerTimers.setInterval).toHaveBeenCalledWith(expect.any(Function), 500);

        cullingSystem.start();
        expect(workerTimers.setInterval).toHaveBeenCalledTimes(1);

        cullingSystem.stop();
        expect(workerTimers.clearInterval).toHaveBeenCalledTimes(1);
    });

    it('should tell controller to VIRTUALIZE a playing sound when its bus volume drops below threshold', () => {
        const violinsId = addMockPlayback(1, 'violins', 'playing');

        cullingSystem.start();
        mockBusVolumes['music'] = 0.005;

        triggerTick();

        expect(mockController.virtualize).toHaveBeenCalledTimes(1);
        expect(mockController.virtualize).toHaveBeenCalledWith(violinsId);
        expect(playbackStates.get(violinsId)).toBe('virtual');
    });

    it('should tell controller to DEVIRTUALIZE a sleeping sound when its bus volume rises above threshold', () => {
        const violinsId = addMockPlayback(1, 'violins', 'virtual');

        cullingSystem.start();
        mockBusVolumes['music'] = 1;

        triggerTick();

        expect(mockController.devirtualize).toHaveBeenCalledTimes(1);
        expect(mockController.devirtualize).toHaveBeenCalledWith(violinsId);
        expect(playbackStates.get(violinsId)).toBe('playing');
    });

    it('should NOT affect sounds on other buses that are still loud', () => {
        const violinsId = addMockPlayback(1, 'violins', 'playing');
        const explosionId = addMockPlayback(2, 'explosion', 'playing');

        cullingSystem.start();

        mockBusVolumes['music'] = 0;
        mockBusVolumes['sfx'] = 1;

        triggerTick();

        expect(mockController.virtualize).toHaveBeenCalledTimes(1);
        expect(mockController.virtualize).toHaveBeenCalledWith(violinsId);

        expect(mockController.virtualize).not.toHaveBeenCalledWith(explosionId);
        expect(playbackStates.get(explosionId)).toBe('playing');
    });

    it('should do nothing if sound state and volume already match', () => {
        addMockPlayback(1, 'violins', 'playing');

        cullingSystem.start();
        triggerTick();

        expect(mockController.virtualize).not.toHaveBeenCalled();
        expect(mockController.devirtualize).not.toHaveBeenCalled();
    });

    it('should safely ignore playbacks with unknown soundIds or busIds', () => {
        addMockPlayback(1, 'unknown_sound', 'playing');

        cullingSystem.start();
        triggerTick();

        expect(mockController.virtualize).not.toHaveBeenCalled();
    });
});
