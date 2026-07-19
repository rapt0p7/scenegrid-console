// oxlint-disable typescript/strict-void-return
// noinspection D

import { describe, it, expect, vi, beforeEach, Mocked } from 'vitest';
import { TelemetrySnapshotter } from '@infrastructure/telemetry/TelemetrySnapshotter.js';

import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISwitchHistoryRegistry } from '@domain/Managers/Ports/ISwitchHistoryRegistry.js';
import type {
    GameParamId,
    SoundId,
    PlaybackId,
    ITelemetrySnapshot,
    BusId,
    IMusicTrackSnapshot,
    RegionId,
    Milliseconds
} from '@scene-grid/shared';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';

describe('TelemetrySnapshotter', () => {
    let mockDispatcher: { dispatch: ReturnType<typeof vi.fn> };
    let mockSequencer: Mocked<ISequencer>;
    let mockSoundController: {
        getActivePlaybacks: ReturnType<typeof vi.fn>;
        getSoundId: ReturnType<typeof vi.fn>;
        getPlaybackState: ReturnType<typeof vi.fn>;
        getPlaybackPositionSec: ReturnType<typeof vi.fn>;
        getCurrentVolume: ReturnType<typeof vi.fn>;
    };
    let mockRtpcAdapter: { getValue: ReturnType<typeof vi.fn> };
    let mockSwitchRegistry: { getHistory: ReturnType<typeof vi.fn> };
    // oxlint-disable-next-line typescript/no-explicit-any
    let mockBusSystem: any;

    let snapshotter: TelemetrySnapshotter;

    const rtpcKeys = ['speed', 'health'] as GameParamId[];
    const switchKeys = ['material', 'weather'] as SoundId[];
    const busKeys = ['main', 'sfx'] as BusId[];

    beforeEach(() => {
        mockDispatcher = { dispatch: vi.fn() };
        mockSoundController = {
            getActivePlaybacks: vi.fn().mockReturnValue([]),
            getSoundId: vi.fn(),
            getPlaybackState: vi.fn(),
            getPlaybackPositionSec: vi.fn(),
            getCurrentVolume: vi.fn()
        };
        mockSequencer = {
            getPlaybackInfo: vi.fn(),
            getMusicSnapshot: vi.fn().mockReturnValue([]),
            playLoop: vi.fn(),
            playStinger: vi.fn(),
            stopLoop: vi.fn(),
            transitionTo: vi.fn(),
            destroy: vi.fn()
        };
        mockRtpcAdapter = { getValue: vi.fn() };
        mockSwitchRegistry = { getHistory: vi.fn() };

        mockBusSystem = {
            getBusLogicalGain: vi.fn(),
            getBusRtpcGain: vi.fn(),
            getBusFinalGain: vi.fn(),
            getSidechainGain: vi.fn()
        };

        snapshotter = new TelemetrySnapshotter(
            mockDispatcher as unknown as ITelemetryDispatcher,
            mockSoundController as unknown as ISoundController,
            mockRtpcAdapter as unknown as IRTPCAdapter,
            mockBusSystem,
            mockSwitchRegistry as unknown as ISwitchHistoryRegistry,
            mockSequencer,
            rtpcKeys,
            switchKeys,
            busKeys,
            2
        );
    });

    it('should not dispatch if TICK_RATE_MS has not elapsed', () => {
        snapshotter.tick(0.05, 50 as Milliseconds);
        expect(mockDispatcher.dispatch).not.toHaveBeenCalled();

        snapshotter.tick(0.099, 49 as Milliseconds);
        expect(mockDispatcher.dispatch).not.toHaveBeenCalled();

        snapshotter.tick(0.1, 1 as Milliseconds);
        expect(mockDispatcher.dispatch).toHaveBeenCalledTimes(1);
    });

    it('should collect RTPCs correctly and fallback to 0 if undefined', () => {
        mockRtpcAdapter.getValue.mockImplementation((param: string) => {
            if (param === 'speed') return 120;
            // oxlint-disable-next-line unicorn/no-useless-undefined
            return undefined;
        });

        snapshotter.tick(0.1, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot;
        expect(dispatchCall.rtpcs).toEqual([
            { param: 'speed', value: 120 },
            { param: 'health', value: 0 }
        ]);
    });

    it('should collect only active switches and slice the pool correctly', () => {
        // oxlint-disable-next-line typescript/consistent-return
        mockSwitchRegistry.getHistory.mockImplementation((switchId: string) => {
            if (switchId === 'material') return { currentSwitchKey: 'wood' };
            if (switchId === 'weather') return { currentSwitchKey: undefined };
            // oxlint-disable-next-line unicorn/no-useless-undefined
            return undefined;
        });

        snapshotter.tick(0.1, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot;
        expect(dispatchCall.switches).toHaveLength(1);
        expect(dispatchCall.switches).toEqual([{ switchId: 'material', currentKey: 'wood' }]);
    });

    it('should return full switch pool without slicing if all switches are active', () => {
        mockSwitchRegistry.getHistory.mockReturnValue({ currentSwitchKey: 'active' });

        snapshotter.tick(0.1, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot;
        expect(dispatchCall.switches).toHaveLength(2);
    });

    it('should collect playbacks, handle virtual states, and extract position/volume', () => {
        const mockPlaybacks = [1, 2] as PlaybackId[];
        mockSoundController.getActivePlaybacks.mockReturnValue(mockPlaybacks);

        mockSoundController.getSoundId.mockImplementation((id: number) => (id === 1 ? 'bgm' : 'sfx'));
        mockSoundController.getPlaybackState.mockImplementation((id: number) => (id === 1 ? 'playing' : 'virtual'));
        mockSoundController.getPlaybackPositionSec.mockImplementation((id: number) => (id === 1 ? 12.5 : 5.0));
        mockSoundController.getCurrentVolume.mockImplementation((id: number) => (id === 1 ? 0.8 : 1.0));

        snapshotter.tick(0.1, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot;

        expect(dispatchCall.activePlaybacks).toHaveLength(2);
        expect(dispatchCall.activePlaybacks[0]).toEqual({
            playbackId: 1,
            soundId: 'bgm',
            positionSec: 12.5,
            volume: 0.8,
            isVirtual: false
        });
        expect(dispatchCall.activePlaybacks[1]).toEqual({
            playbackId: 2,
            soundId: 'sfx',
            positionSec: 5.0,
            volume: 1.0,
            isVirtual: true
        });
    });

    it('should skip playbacks if soundId is missing (Voice destroyed mid-tick)', () => {
        mockSoundController.getActivePlaybacks.mockReturnValue([1] as PlaybackId[]);
        // oxlint-disable-next-line unicorn/no-useless-undefined
        mockSoundController.getSoundId.mockReturnValue(undefined);

        snapshotter.tick(0.1, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot;
        expect(dispatchCall.activePlaybacks).toHaveLength(0);
    });

    it('should stop collecting playbacks if active voices exceed playbackPool capacity', () => {
        mockSoundController.getActivePlaybacks.mockReturnValue([1, 2, 3] as PlaybackId[]);
        mockSoundController.getSoundId.mockReturnValue('test-sound');
        mockSoundController.getPlaybackState.mockReturnValue('playing');

        snapshotter.tick(0.1, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot;

        expect(dispatchCall.activePlaybacks).toHaveLength(2);
        expect(dispatchCall.activePlaybacks[0].playbackId).toBe(1);
        expect(dispatchCall.activePlaybacks[1].playbackId).toBe(2);
    });

    it('should fallback to 0 / 1 if position and volume getters are missing on interface', () => {
        mockSoundController.getActivePlaybacks.mockReturnValue([1] as PlaybackId[]);
        mockSoundController.getSoundId.mockReturnValue('bgm');
        mockSoundController.getPlaybackState.mockReturnValue('playing');

        // oxlint-disable-next-line typescript/no-explicit-any
        delete (mockSoundController as any).getPlaybackPositionSec;
        // oxlint-disable-next-line typescript/no-explicit-any
        delete (mockSoundController as any).getCurrentVolume;

        snapshotter.tick(0.1, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot;

        expect(dispatchCall.activePlaybacks[0].positionSec).toBe(0);
        expect(dispatchCall.activePlaybacks[0].volume).toBe(1);
    });

    it('should collect bus gains and sidechain correctly, falling back to 1 if undefined', () => {
        mockBusSystem.getBusLogicalGain.mockImplementation((busId: string) => (busId === 'main' ? 0.8 : undefined));
        mockBusSystem.getBusRtpcGain.mockImplementation((busId: string) => (busId === 'main' ? 0.9 : undefined));
        mockBusSystem.getBusFinalGain.mockImplementation((busId: string) => (busId === 'main' ? 0.72 : undefined));
        mockBusSystem.getSidechainGain.mockImplementation((busId: string) => (busId === 'main' ? 0.5 : undefined));

        snapshotter.tick(0.1, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot;

        expect(dispatchCall.buses).toHaveLength(2);

        expect(dispatchCall.buses[0]).toEqual(
            expect.objectContaining({
                busId: 'main',
                logicalGain: 0.8,
                rtpcGain: 0.9,
                finalGain: 0.72,
                sidechainGain: 0.5,
                modifiersCount: 0
            })
        );

        expect(dispatchCall.buses[1]).toEqual(
            expect.objectContaining({
                busId: 'sfx',
                logicalGain: 1,
                rtpcGain: 1,
                finalGain: 1,
                sidechainGain: undefined,
                modifiersCount: 0
            })
        );
    });

    it('should collect music tracks correctly from sequencer', () => {
        const mockTracks: IMusicTrackSnapshot[] = [
            {
                soundId: 'music_a' as SoundId,
                state: 'LOOPING',
                currentRegion: 'intro' as RegionId,
                targetRegion: null,
                queueLength: 0
            },
            {
                soundId: 'music_b' as SoundId,
                state: 'TRANSITIONING',
                currentRegion: 'bridge' as RegionId,
                targetRegion: 'chorus' as RegionId,
                queueLength: 1
            }
        ];
        mockSequencer.getMusicSnapshot.mockReturnValue(mockTracks);

        snapshotter.tick(0.1, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot;

        expect(dispatchCall.musicTracks).toHaveLength(2);
        expect(dispatchCall.musicTracks).toEqual(mockTracks);
    });

    it('should correctly resize musicTracks array when tracks are stopped (Zero Allocation check)', () => {
        const mockTrack: IMusicTrackSnapshot = {
            soundId: 'music_a' as SoundId,
            state: 'LOOPING',
            currentRegion: 'intro' as RegionId,
            targetRegion: null,
            queueLength: 0
        };

        mockSequencer.getMusicSnapshot.mockReturnValue([mockTrack]);
        snapshotter.tick(0.1, 100 as Milliseconds);
        expect((mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot).musicTracks).toHaveLength(1);

        mockSequencer.getMusicSnapshot.mockReturnValue([]);
        snapshotter.tick(0.2, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[1][0] as ITelemetrySnapshot;
        expect(dispatchCall.musicTracks).toHaveLength(0);
        expect(dispatchCall.musicTracks).toBe(
            (mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot).musicTracks
        );
    });

    it('should fallback to empty array safely if getMusicSnapshot returns undefined', () => {
        // oxlint-disable-next-line typescript/no-explicit-any
        mockSequencer.getMusicSnapshot.mockReturnValue(undefined as any);

        snapshotter.tick(0.1, 100 as Milliseconds);

        const dispatchCall = mockDispatcher.dispatch.mock.calls[0][0] as ITelemetrySnapshot;
        expect(dispatchCall.musicTracks).toHaveLength(0);
    });
});
