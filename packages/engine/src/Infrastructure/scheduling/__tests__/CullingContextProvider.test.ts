// noinspection D

import type { BusId, PlaybackId, SoundId } from '@scene-grid/shared';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CullingContextProvider } from '../CullingContextProvider.js';

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
            getPlaybackState: vi.fn().mockImplementation(id => (id === 101 ? 'playing' : 'stopped')),
            getLogicalState: vi.fn().mockImplementation(id => {
                if (id === 101) return 'playing';
                if (id === 102) return 'paused';
                return undefined;
            })
        };

        mockBusSystem = {
            getBus: vi.fn().mockImplementation(id => (id === 'music_bus' ? { logicalTargetGain: 0.5 } : undefined)),
            getCurrentRealGain: vi.fn().mockReturnValue(0.8)
        };

        mockSoundMap = {
            test_sound: { busId: 'music_bus' },
            orphan_sound: {}
        };

        provider = new CullingContextProvider(mockController, mockBusSystem, mockSoundMap);
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

    it('should delegate getLogicalState to SoundController', () => {
        expect(provider.getLogicalState(101 as PlaybackId)).toBe('playing');
        expect(provider.getLogicalState(102 as PlaybackId)).toBe('paused');
        expect(provider.getLogicalState(999 as PlaybackId)).toBeUndefined();

        expect(mockController.getLogicalState).toHaveBeenCalledWith(101);
    });

    it('should correctly resolve BusId from SoundMap', () => {
        expect(provider.resolveBusId('test_sound' as SoundId)).toBe('music_bus');

        expect(provider.resolveBusId('orphan_sound' as SoundId)).toBeUndefined();
        expect(provider.resolveBusId('unknown_sound' as SoundId)).toBeUndefined();
    });

    it('should return safe default (1) if bus is missing in getBusVolume', () => {
        expect(provider.getBusVolume('missing_bus' as BusId)).toBe(1);
    });

    it('should delegate isGhostVoice to SoundController', () => {
        mockController.isGhostVoice = vi.fn().mockImplementation(id => id === 101);
        expect(provider.isGhostVoice(101 as PlaybackId)).toBe(true);
        expect(provider.isGhostVoice(102 as PlaybackId)).toBe(false);
        expect(mockController.isGhostVoice).toHaveBeenCalledWith(101);
    });

    it('should calculate correct bus volume using Math.max(realGain, logicalTargetGain)', () => {
        expect(provider.getBusVolume('music_bus' as BusId)).toBe(0.8);

        mockBusSystem.getCurrentRealGain.mockReturnValueOnce(0.2);
        expect(provider.getBusVolume('music_bus' as BusId)).toBe(0.5);
    });
});
