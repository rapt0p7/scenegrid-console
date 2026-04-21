/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CullingContextProvider } from '../CullingContextProvider.js';

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { BusId, PlaybackId, SoundId } from '@shared/Types/Branded.js';

describe('CullingContextProvider (Infrastructure Adapter)', () => {
    let mockController: any;
    let mockBusSystem: any;
    let mockSoundMap: any;
    let provider: CullingContextProvider;

    beforeEach(() => {
        vi.clearAllMocks();

        mockController = {
            getActivePlaybacks: vi.fn().mockReturnValue([101, 102]),
            getSoundId: vi.fn().mockImplementation(id => (id === 101 ? 'test_sound' : undefined)),
            getPlaybackState: vi.fn().mockImplementation(id => (id === 101 ? 'playing' : 'stopped'))
        };

        mockBusSystem = {
            getBus: vi.fn().mockImplementation(id => (id === 'music_bus' ? { logicalTargetGain: 0.5 } : undefined)),
            getCurrentRealGain: vi.fn().mockReturnValue(0.8)
        };

        mockSoundMap = {
            test_sound: { busId: 'music_bus' },
            orphan_sound: {}
        };

        provider = new CullingContextProvider(
            mockController as unknown as ISoundController,
            mockBusSystem as unknown as IAudioBusSystem,
            mockSoundMap as unknown as ISoundMap
        );
    });

    it('should delegate activePlaybacks getter to SoundController', () => {
        expect(provider.activePlaybacks).toEqual([101, 102]);
        expect(mockController.getActivePlaybacks).toHaveBeenCalled();
    });

    it('should delegate getSoundId to SoundController', () => {
        expect(provider.getSoundId(101 as PlaybackId)).toBe('test_sound');
        expect(provider.getSoundId(999 as PlaybackId)).toBeUndefined();
    });

    it('should delegate getPlaybackState to SoundController', () => {
        expect(provider.getPlaybackState(101 as PlaybackId)).toBe('playing');
        expect(provider.getPlaybackState(999 as PlaybackId)).toBe('stopped');
    });

    it('should correctly resolve BusId from SoundMap', () => {
        expect(provider.resolveBusId('test_sound' as SoundId)).toBe('music_bus');

        expect(provider.resolveBusId('orphan_sound' as SoundId)).toBeUndefined();
        expect(provider.resolveBusId('unknown_sound' as SoundId)).toBeUndefined();
    });

    it('should return safe default (1) if bus is missing in getBusVolume', () => {
        expect(provider.getBusVolume('missing_bus' as BusId)).toBe(1);
    });

    it('should calculate correct bus volume using Math.max(realGain, logicalTargetGain)', () => {
        expect(provider.getBusVolume('music_bus' as BusId)).toBe(0.8);

        mockBusSystem.getCurrentRealGain.mockReturnValueOnce(0.2);
        expect(provider.getBusVolume('music_bus' as BusId)).toBe(0.5);
    });
});
