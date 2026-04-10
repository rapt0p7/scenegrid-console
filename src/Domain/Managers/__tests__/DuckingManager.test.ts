import { describe, it, expect, vi, beforeEach } from 'vitest';

import DuckingManager from '@domain/Managers/DuckingManager.js';

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { BusId, PlaybackId } from '@domain/Types/Branded.js';
import type { Mocked } from 'vitest';

describe('DuckingManager', () => {
    let mockBusSystem: Mocked<IAudioBusSystem>;
    let mockSoundController: Mocked<ISoundController>;
    let manager: DuckingManager;

    let capturedCleanupCallback: (() => void) | null;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedCleanupCallback = null;

        mockBusSystem = {
            routePlayback: vi.fn(),
            addSidechainTrigger: vi.fn(),
            removeSidechainTrigger: vi.fn(),
            clearAllSidechainTriggers: vi.fn(),
            getBus: vi.fn(),
            getAllBuses: vi.fn(),
            applySend: vi.fn()
        };

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
            onVoiceEnded: vi.fn().mockImplementation((id, callback) => {
                capturedCleanupCallback = callback;
                return vi.fn();
            })
        } as unknown as Mocked<ISoundController>;

        manager = new DuckingManager(mockBusSystem, mockSoundController);
    });

    it('should add sidechain trigger via bus system and setup cleanup event', () => {
        const testId = 123 as PlaybackId;
        manager.triggerDucking(testId, 'music_bus' as BusId, 0.8);

        expect(mockBusSystem.addSidechainTrigger).toHaveBeenCalledWith('music_bus', testId, 0.8);

        expect(mockSoundController.onVoiceEnded).toHaveBeenCalledWith(testId, expect.any(Function));
    });

    it('should remove sidechain trigger when voice ends (Memory Leak Prevention)', () => {
        const testId = 456 as PlaybackId;
        manager.triggerDucking(testId, 'music_bus' as BusId, 1);

        expect(mockBusSystem.removeSidechainTrigger).not.toHaveBeenCalled();

        expect(capturedCleanupCallback).toBeDefined();
        capturedCleanupCallback!();

        expect(mockBusSystem.removeSidechainTrigger).toHaveBeenCalledWith('music_bus', testId);
    });

    it('should support ducking multiple buses simultaneously with different intensities', () => {
        const testId = 789 as PlaybackId;
        manager.triggerDucking(testId, ['music_bus', 'ambience_bus'] as BusId[], [1, 0.5]);

        expect(mockBusSystem.addSidechainTrigger).toHaveBeenCalledTimes(2);
        expect(mockBusSystem.addSidechainTrigger).toHaveBeenNthCalledWith(1, 'music_bus', testId, 1);
        expect(mockBusSystem.addSidechainTrigger).toHaveBeenNthCalledWith(2, 'ambience_bus', testId, 0.5);

        capturedCleanupCallback!();
        expect(mockBusSystem.removeSidechainTrigger).toHaveBeenCalledTimes(2);
        expect(mockBusSystem.removeSidechainTrigger).toHaveBeenNthCalledWith(1, 'music_bus', testId);
        expect(mockBusSystem.removeSidechainTrigger).toHaveBeenNthCalledWith(2, 'ambience_bus', testId);
    });

    it('should fallback to default intensity (1) if intensity array is shorter than buses array', () => {
        const testId = 999 as PlaybackId;
        manager.triggerDucking(testId, ['bus_A', 'bus_B'] as BusId[], [0.2]);

        expect(mockBusSystem.addSidechainTrigger).toHaveBeenCalledTimes(2);
        expect(mockBusSystem.addSidechainTrigger).toHaveBeenNthCalledWith(1, 'bus_A', testId, 0.2);
        expect(mockBusSystem.addSidechainTrigger).toHaveBeenNthCalledWith(2, 'bus_B', testId, 1);
    });

    it('should delegate clearAll() to the bus system', () => {
        manager.clearAll();
        expect(mockBusSystem.clearAllSidechainTriggers).toHaveBeenCalledTimes(1);
    });
});
