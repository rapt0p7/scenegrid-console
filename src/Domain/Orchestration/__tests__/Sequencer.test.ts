/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { LoopState } from '@domain/Orchestration/Ports/ISequencer.js';
import Sequencer from '@domain/Orchestration/Sequencer.js';

import type { IEngineTicker } from '@domain/Shared/Ports/IEngineTicker.js';
import type { PlaybackId, RegionId, SoundId } from '@domain/Types/Branded.js';
import type { Mocked } from 'vitest';

vi.mock('../AudioGrid', () => {
    const MockGrid = vi.fn();
    MockGrid.prototype.getNextBeatTime = vi.fn().mockReturnValue(1.5);
    MockGrid.prototype.getNextBarTime = vi.fn().mockReturnValue(2);
    return { default: MockGrid };
});

describe('Sequencer (Interactive Music)', () => {
    let mockContext: any;
    let mockController: any;
    let mockRouter: any;
    let mockTicker: Mocked<IEngineTicker>;
    let manager: Sequencer;

    let capturedOnVoiceEnded: (() => void) | null;
    let capturedTickCallback: ((currentTime: number, deltaTimeMs: number) => void) | null;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedOnVoiceEnded = null;
        capturedTickCallback = null;

        mockContext = { currentTime: 0, sampleRate: 44_100 };

        mockTicker = {
            add: vi.fn().mockImplementation((id, interval, callback) => {
                capturedTickCallback = callback;
            }),
            remove: vi.fn(),
            start: vi.fn(),
            stop: vi.fn()
        };

        mockController = {
            play: vi.fn().mockReturnValue(1 as PlaybackId),
            stopById: vi.fn(),
            stopAll: vi.fn(),
            cancelScheduled: vi.fn(),
            getCurrentTime: vi.fn().mockImplementation(() => mockContext.currentTime),
            getSampleRate: vi.fn().mockReturnValue(44_100),
            setVolume: vi.fn(),
            fadeVolume: vi.fn(),
            fadeParameter: vi.fn(),
            getActivePlaybacks: vi.fn(),
            getSoundId: vi.fn(),
            getPlaybackState: vi.fn(),
            virtualize: vi.fn(),
            devirtualize: vi.fn(),
            onVoiceEnded: vi.fn().mockImplementation((id, callback) => {
                capturedOnVoiceEnded = callback;
                return vi.fn();
            })
        };

        mockRouter = {
            getSoundConfig: vi.fn().mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    beatsPerBar: 4,
                    crossfade: 500,
                    regions: {
                        intro: [0, 44_100],
                        main: [44_100, 132_300],
                        fill: [132_300, 176_400]
                    }
                }
            }),
            routeSound: vi.fn(),
            applyConfigToPlayback: vi.fn()
        };

        manager = new Sequencer(mockController, mockRouter, mockTicker);
    });

    afterEach(() => {
        manager.destroy();
    });

    function triggerTick(deltaTimeMs: number = 25) {
        if (capturedTickCallback) {
            capturedTickCallback(mockContext.currentTime, deltaTimeMs);
        }
    }

    it('should start timer on init and clear on destroy via EngineTicker', () => {
        expect(mockTicker.add).toHaveBeenCalledTimes(1);
        expect(mockTicker.add).toHaveBeenCalledWith(expect.any(String), expect.any(Number), expect.any(Function));
        manager.destroy();
        expect(mockTicker.remove).toHaveBeenCalledTimes(1);
    });

    it('should schedule the initial loop region correctly', () => {
        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
        expect(mockController.play).toHaveBeenCalledWith('battle_music', {
            when: 0,
            offset: 0,
            duration: 1
        });
        const expectedConfig = mockRouter.getSoundConfig('battle_music');
        expect(mockRouter.applyConfigToPlayback).toHaveBeenCalledWith(1, expectedConfig);
    });

    it('should pre-schedule the next iteration via Lookahead Window', () => {
        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
        mockController.play.mockClear();

        mockContext.currentTime = 0.95;
        triggerTick();

        expect(mockController.play).toHaveBeenCalledTimes(1);
        const arguments_ = mockController.play.mock.calls[0];

        expect(arguments_[0]).toBe('battle_music');
        expect(arguments_[1].when).toBeCloseTo(0.05, 5);
        expect(arguments_[1].offset).toBe(0);
        expect(arguments_[1].duration).toBe(1);
    });

    it('should stop loop and cancel scheduled regions', () => {
        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
        manager.stopLoop('battle_music' as SoundId);
        expect(mockController.cancelScheduled).toHaveBeenCalledWith(1);
    });

    it('should perform DIRECT transition with full crossfade (No Fill)', () => {
        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
        mockContext.currentTime = 0.5;

        manager.transitionTo({
            soundId: 'battle_music' as SoundId,
            targetRegion: 'main' as RegionId,
            transitionRegionName: '' as RegionId,
            options: { quantize: 'Immediate', crossfadeDuration: 1000 }
        });

        expect(mockController.fadeVolume).toHaveBeenCalledWith(1, 0, 1000, 'equal-power', 0);
        expect(mockController.stopById).toHaveBeenCalledWith(1, 1.5);

        expect(mockController.play).toHaveBeenCalledWith('battle_music', {
            when: 0,
            offset: 1,
            duration: 2
        });
    });

    it('should perform FILL transition with equal-power crossfade', () => {
        mockController.play.mockReturnValueOnce(1 as PlaybackId);

        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
        mockController.play.mockClear();
        mockContext.currentTime = 0.5;

        mockController.play.mockReturnValueOnce(2 as PlaybackId);

        manager.transitionTo({
            soundId: 'battle_music' as SoundId,
            targetRegion: 'main' as RegionId,
            transitionRegionName: 'fill' as RegionId,
            options: { quantize: 'Immediate', crossfadeDuration: 4000 }
        });

        expect(mockController.fadeVolume).toHaveBeenCalledWith(1, 0, 4000, 'equal-power', 0);
        expect(mockController.stopById).toHaveBeenCalledWith(1, 4.5);

        expect(mockController.play).toHaveBeenCalledWith('battle_music', {
            when: 0,
            offset: 3,
            duration: 1
        });

        expect(mockController.fadeVolume).toHaveBeenCalledWith(2, 1, 4000, 'equal-power', 0);
    });

    it('should perform QUANTIZED transition using AudioGrid', () => {
        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
        mockController.play.mockClear();
        mockContext.currentTime = 0.8;

        manager.transitionTo({
            soundId: 'battle_music' as SoundId,
            targetRegion: 'main' as RegionId,
            transitionRegionName: '' as RegionId,
            options: { quantize: 'NextBar' }
        });

        expect(mockController.play).not.toHaveBeenCalled();

        mockContext.currentTime = 1.95;
        triggerTick();

        expect(mockController.play).toHaveBeenCalledTimes(1);

        const arguments_ = mockController.play.mock.calls[0];
        expect(arguments_[1].when).toBeCloseTo(0.05, 5);
        expect(arguments_[1].offset).toBe(1);
        expect(arguments_[1].duration).toBe(2);
    });

    it('should stop instance immediately without ramp if crossfadeDuration is 0', () => {
        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

        const track = (manager as any).tracks.get('battle_music');
        const activeRegion = {
            playbackId: 1 as PlaybackId,
            scheduledStartTime: -1,
            unsubscribe: vi.fn()
        };

        track.activeRegions.add(activeRegion);
        track.state = LoopState.LOOPING;

        manager.transitionTo({
            soundId: 'battle_music' as SoundId,
            targetRegion: 'main' as RegionId,
            transitionRegionName: '' as RegionId,
            options: {
                quantize: 'Immediate',
                crossfadeDuration: 0
            }
        });

        expect(mockController.fadeVolume).not.toHaveBeenCalled();
        expect(mockController.stopById).toHaveBeenCalledWith(1, 0);
    });

    it('should handle voice drop (controller.play returns null) and move schedule pointer forward', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        mockController.play.mockReturnValueOnce(null);

        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to schedule region'));
        expect((manager as any).tracks.get('battle_music').nextScheduleTime).toBe(1);
        warnSpy.mockRestore();
    });

    it('should cleanup active regions and unsubscribe on "ended" event', () => {
        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

        const track = (manager as any).tracks.get('battle_music');
        expect(track.activeRegions.size).toBe(1);

        expect(capturedOnVoiceEnded).not.toBeNull();
        capturedOnVoiceEnded!();

        expect(track.activeRegions.size).toBe(0);
    });

    describe('Coverage Edge Cases & Branches', () => {
        it('should ignore transition if track is TRANSITIONING and not interruptable', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            const track = (manager as any).getTrackContext('battle_music');
            track.state = LoopState.TRANSITIONING;

            mockController.play.mockClear();

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'Immediate', interruptable: false }
            });

            expect(mockController.play).not.toHaveBeenCalled();
        });

        it('should return early from transitionTo if config has no smartLoop', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            mockRouter.getSoundConfig.mockReturnValueOnce({ busId: 'music' });

            const track = (manager as any).getTrackContext('battle_music');
            const playIdBefore = track.playId;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'Immediate' }
            });

            expect(track.playId).toBe(playIdBefore);
        });

        it('should correctly process NextBeat and NextBar with explicit grid', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            const customGrid = {
                getNextBeatTime: vi.fn().mockReturnValue(5),
                getNextBarTime: vi.fn().mockReturnValue(8)
            } as any;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBeat', grid: customGrid }
            });
            expect(customGrid.getNextBeatTime).toHaveBeenCalled();

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBar', grid: customGrid }
            });
            expect(customGrid.getNextBarTime).toHaveBeenCalled();
        });

        it('should use internal grid for NextBeat when explicit grid is not provided', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBeat' }
            });

            const track = (manager as any).getTrackContext('battle_music');
            expect(track.nextScheduleTime).toBe(1.5);
        });

        it('should skip processing tick for tracks that are not LOOPING', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            manager.stopLoop('battle_music' as SoundId);

            mockController.play.mockClear();
            triggerTick();

            expect(mockController.play).not.toHaveBeenCalled();
        });

        it('should break processing loop if nextRegionName is null', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            const track = (manager as any).getTrackContext('battle_music');
            track.loopRegion = null;
            track.regionQueue = [];

            mockController.play.mockClear();
            triggerTick();

            expect(mockController.play).not.toHaveBeenCalled();
        });

        it('should return null in scheduleRegion if region does not exist in config', () => {
            manager.playLoop('battle_music' as SoundId, 'invalid_region_name' as RegionId);

            expect(mockController.play).not.toHaveBeenCalledWith('battle_music', expect.anything());
        });

        it('should return null in scheduleRegion if smartLoop config is missing', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            mockRouter.getSoundConfig.mockReturnValueOnce({ busId: 'music' });

            const track = (manager as any).getTrackContext('battle_music');
            const result = (manager as any).scheduleRegion({
                soundId: 'battle_music',
                regionName: 'intro',
                targetTime: 0,
                track
            });

            expect(result).toBeNull();
        });
    });
});
