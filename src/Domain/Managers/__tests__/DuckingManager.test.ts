// noinspection D
import { describe, it, expect, vi, beforeEach } from 'vitest';

import DuckingManager from '@domain/Managers/DuckingManager.js';

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { BusId, PlaybackId } from '@shared/Types/Branded.js';
import type { Mocked } from 'vitest';

describe('DuckingManager', () => {
    let mockBusSystem: Mocked<IAudioBusSystem>;
    let mockSoundController: Mocked<ISoundController>;
    let manager: DuckingManager;

    beforeEach(() => {
        vi.clearAllMocks();

        mockBusSystem = {
            clearAllSidechainTriggers: vi.fn(),
            getBus: vi.fn(),
            getAllBuses: vi.fn(),
            applySend: vi.fn(),
            getCurrentRealGain: vi.fn()
        } as unknown as Mocked<IAudioBusSystem>;

        mockSoundController = {
            play: vi.fn(),
            stopById: vi.fn(),
            stopAll: vi.fn(),
            setVolume: vi.fn(),
            fadeVolume: vi.fn(),
            getCurrentTime: vi.fn(),
            getSampleRate: vi.fn(),
            cancelScheduled: vi.fn(),
            fadeParameter: vi.fn(),
            getActivePlaybacks: vi.fn(),
            getSoundId: vi.fn(),
            getPlaybackState: vi.fn(),
            virtualize: vi.fn(),
            devirtualize: vi.fn(),
            routeToBus: vi.fn(),
            addSidechainTrigger: vi.fn(),
            removeSidechainTrigger: vi.fn(),
            onVoiceEnded: vi.fn()
        } as unknown as Mocked<ISoundController>;

        manager = new DuckingManager(mockBusSystem, mockSoundController);
    });

    it('should add sidechain trigger via SoundController (Fire and Forget)', () => {
        const testId = 123 as PlaybackId;
        manager.triggerDucking(testId, 'music_bus' as BusId, 0.8);

        expect(mockSoundController.addSidechainTrigger).toHaveBeenCalledWith(testId, 'music_bus', 0.8);

        expect(mockSoundController.onVoiceEnded).not.toHaveBeenCalled();
    });

    it('should support ducking multiple buses simultaneously with different intensities', () => {
        const testId = 789 as PlaybackId;
        manager.triggerDucking(testId, ['music_bus', 'ambience_bus'] as BusId[], [1, 0.5]);

        expect(mockSoundController.addSidechainTrigger).toHaveBeenCalledTimes(2);
        expect(mockSoundController.addSidechainTrigger).toHaveBeenNthCalledWith(1, testId, 'music_bus', 1);
        expect(mockSoundController.addSidechainTrigger).toHaveBeenNthCalledWith(2, testId, 'ambience_bus', 0.5);
    });

    it('should fallback to default intensity (1) if intensity array is shorter than buses array', () => {
        const testId = 999 as PlaybackId;
        manager.triggerDucking(testId, ['bus_A', 'bus_B'] as BusId[], [0.2]);

        expect(mockSoundController.addSidechainTrigger).toHaveBeenCalledTimes(2);
        expect(mockSoundController.addSidechainTrigger).toHaveBeenNthCalledWith(1, testId, 'bus_A', 0.2);
        expect(mockSoundController.addSidechainTrigger).toHaveBeenNthCalledWith(2, testId, 'bus_B', 1);
    });

    it('should delegate clearAll() to the bus system', () => {
        manager.clearAll();
        expect(mockBusSystem.clearAllSidechainTriggers).toHaveBeenCalledTimes(1);
    });
});
