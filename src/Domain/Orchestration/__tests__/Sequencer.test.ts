/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioContext as MockAudioContext, registrar } from 'standardized-audio-context-mock';

import { LoopState } from '@domain/Orchestration/Ports/ISequencer.js';
import Sequencer from '@domain/Orchestration/Sequencer.js';

import type { IEngineTicker } from '@domain/Shared/Ports/IEngineTicker.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { PlaybackId, RegionId, SoundId } from '@shared/Types/Branded.js';
import type { Mocked } from 'vitest';

vi.mock('../AudioGrid', () => {
    const MockGrid = vi.fn();
    MockGrid.prototype.getNextBeatTime = vi.fn().mockReturnValue(1.5);
    MockGrid.prototype.getNextBarTime = vi.fn().mockReturnValue(2);
    return { default: MockGrid };
});

describe('Sequencer (Interactive Music)', () => {
    let mockContext: MockAudioContext;
    let simulatedTime: number;

    let mockController: any;
    let mockRouter: any;
    let mockTicker: Mocked<IEngineTicker>;
    let mockTransitionPolicy: any;
    let manager: Sequencer;

    let capturedOnVoiceEnded: (() => void) | null;
    let capturedTickTarget: ITickable | null;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedOnVoiceEnded = null;
        capturedTickTarget = null;

        simulatedTime = 0;
        mockContext = new MockAudioContext();

        mockTicker = {
            add: vi.fn().mockImplementation((id, interval, target: ITickable) => {
                capturedTickTarget = target;
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
            getCurrentTime: vi.fn().mockImplementation(() => simulatedTime),
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
            applyConfigToPlayback: vi.fn(),
            play: vi.fn()
        };

        mockTransitionPolicy = {
            evaluate: vi.fn().mockReturnValue(null)
        };

        manager = new Sequencer(mockController, mockRouter, mockTicker, mockTransitionPolicy);
    });

    afterEach(() => {
        manager.destroy();
        registrar.reset(mockContext as any);
    });

    function triggerTick(deltaTimeMs: number = 25) {
        if (capturedTickTarget) {
            capturedTickTarget.tick(simulatedTime, deltaTimeMs);
        }
    }

    it('should start timer on init and clear on destroy via EngineTicker', () => {
        expect(mockTicker.add).toHaveBeenCalledTimes(1);
        expect(mockTicker.add).toHaveBeenCalledWith(expect.any(String), expect.any(Number), expect.any(Object));
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

        simulatedTime = 0.95;
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
        simulatedTime = 0.5;

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
        simulatedTime = 0.5;

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
        simulatedTime = 0.8;

        manager.transitionTo({
            soundId: 'battle_music' as SoundId,
            targetRegion: 'main' as RegionId,
            transitionRegionName: '' as RegionId,
            options: { quantize: 'NextBar' }
        });

        expect(mockController.play).not.toHaveBeenCalled();

        simulatedTime = 1.95;
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

    describe('Pickups (preEntryMs) Logic', () => {
        it('should handle pickups on fresh start by pushing the grid forward to play the full pickup', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: {
                        pickup_region: [44_100, 132_300, 500]
                    }
                }
            });

            simulatedTime = 0;
            manager.playLoop('battle_music' as SoundId, 'pickup_region' as RegionId);

            expect(mockController.play).toHaveBeenCalledTimes(1);
            const playArgs = mockController.play.mock.calls[0][1];

            expect(playArgs.when).toBe(0);
            expect(playArgs.offset).toBeCloseTo(0.5);

            const track = (manager as any).tracks.get('battle_music');
            expect(track.nextScheduleTime).toBeCloseTo(2.5);
        });

        it('should crop the pickup if scheduling is late relative to the locked grid', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: {
                        pickup_region: [44_100, 132_300, 500]
                    }
                }
            });

            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 0;

            simulatedTime = 9.7;

            (manager as any).scheduleRegion({
                soundId: 'battle_music',
                regionName: 'pickup_region',
                targetTime: 10.0,
                track
            });

            expect(mockController.play).toHaveBeenCalledTimes(1);
            const playArgs = mockController.play.mock.calls[0][1];

            expect(playArgs.when).toBe(0);
            expect(playArgs.offset).toBeCloseTo(0.7);

            expect(track.nextScheduleTime).toBeCloseTo(12.0);
        });
    });

    describe('Musical Overlap & Tails (tailDurationMs) Logic', () => {
        it('should append tailMs to the physical duration of the scheduled region without shifting the grid', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: {
                        tail_region: [44_100, 88_200, 0, 1500]
                    }
                }
            });

            simulatedTime = 0;
            manager.playLoop('battle_music' as SoundId, 'tail_region' as RegionId);

            expect(mockController.play).toHaveBeenCalledTimes(1);
            const playArgs = mockController.play.mock.calls[0][1];

            expect(playArgs.duration).toBeCloseTo(2.5);

            const track = (manager as any).tracks.get('battle_music');
            expect(track.nextScheduleTime).toBeCloseTo(1.0);
        });

        it('should perform MUSICAL OVERLAP transition when tailDurationMs is provided', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            simulatedTime = 0.5;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                transitionRegionName: '' as RegionId,
                options: { quantize: 'Immediate', tailDurationMs: 2000 }
            });

            expect(mockController.fadeVolume).not.toHaveBeenCalled();

            expect(mockController.stopById).toHaveBeenCalledWith(1, 2.5);

            expect(mockController.play).toHaveBeenCalledWith(
                'battle_music',
                expect.objectContaining({
                    when: 0,
                    offset: 1
                })
            );
        });
    });

    describe('Stingers (playStinger) Logic', () => {
        beforeEach(() => {
            mockRouter.play.mockClear();
        });

        it('should play stinger immediately if quantize is Immediate', () => {
            manager.playStinger('victory_chord' as SoundId, 'Immediate');
            expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', { delayMs: 0 });
        });

        it('should play stinger immediately if no looping track is active', () => {
            manager.playStinger('victory_chord' as SoundId, 'NextBar');
            expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', { delayMs: 0 });
        });

        it('should quantize stinger to NextBeat using the active track grid', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            mockRouter.play.mockClear();
            simulatedTime = 1.0;

            manager.playStinger('victory_chord' as SoundId, 'NextBeat');

            expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', { delayMs: 500 });
        });

        it('should quantize stinger to NextBar using the explicit reference track', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            mockRouter.play.mockClear();
            simulatedTime = 0.5;

            manager.playStinger('victory_chord' as SoundId, 'NextBar', 'battle_music' as SoundId);

            expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', { delayMs: 1500 });
        });
    });

    describe('Magnet Regions Evaluation', () => {
        it('should evaluate magnets via TransitionPolicy on tick when in a looping state', () => {
            const config = mockRouter.getSoundConfig();

            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            mockTransitionPolicy.evaluate.mockClear();

            triggerTick();

            expect(mockTransitionPolicy.evaluate).toHaveBeenCalledTimes(1);
            expect(mockTransitionPolicy.evaluate).toHaveBeenCalledWith(config, 'intro');
        });

        it('should automatically transition to magnet target if TransitionPolicy returns a decision', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const transitionSpy = vi.spyOn(manager, 'transitionTo');

            mockTransitionPolicy.evaluate.mockReturnValueOnce({
                targetRegion: 'main',
                transitionRegionName: 'fill',
                options: {
                    quantize: 'NextBar',
                    interruptable: true
                }
            });

            triggerTick();

            expect(transitionSpy).toHaveBeenCalledWith({
                soundId: 'battle_music',
                targetRegion: 'main',
                transitionRegionName: 'fill',
                options: expect.objectContaining({
                    quantize: 'NextBar',
                    interruptable: true
                })
            });

            transitionSpy.mockRestore();
        });

        it('should do nothing if TransitionPolicy returns null', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const transitionSpy = vi.spyOn(manager, 'transitionTo');

            mockTransitionPolicy.evaluate.mockClear();
            mockTransitionPolicy.evaluate.mockReturnValue(null);

            triggerTick();

            expect(transitionSpy).not.toHaveBeenCalled();
            transitionSpy.mockRestore();
        });

        describe('FMOD Destination Offset (offsetMode) Logic', () => {
            beforeEach(() => {
                mockRouter.getSoundConfig.mockReturnValue({
                    busId: 'music',
                    smartLoop: {
                        bpm: 120,
                        regions: {
                            source_region: [0, 88_200],
                            target_region: [44_100, 220_500, 500]
                        }
                    }
                });
            });

            it('should apply Relative offset correctly and ignore preEntryMs', () => {
                manager.playLoop('battle_music' as SoundId, 'source_region' as RegionId);

                const track = (manager as any).tracks.get('battle_music');
                track.gridStartTime = 0;
                simulatedTime = 0.5;

                mockController.play.mockClear();

                manager.transitionTo({
                    soundId: 'battle_music' as SoundId,
                    targetRegion: 'target_region' as RegionId,
                    options: { quantize: 'Immediate', offsetMode: 'Relative' }
                });

                expect(mockController.play).toHaveBeenCalledTimes(1);
                const playArgs = mockController.play.mock.calls[0][1];

                expect(playArgs.offset).toBeCloseTo(2.0);
                expect(playArgs.when).toBe(0);
            });

            it('should apply Inverted offset correctly', () => {
                manager.playLoop('battle_music' as SoundId, 'source_region' as RegionId);

                const track = (manager as any).tracks.get('battle_music');
                track.gridStartTime = 0;
                simulatedTime = 0.5;

                mockController.play.mockClear();

                manager.transitionTo({
                    soundId: 'battle_music' as SoundId,
                    targetRegion: 'target_region' as RegionId,
                    options: { quantize: 'Immediate', offsetMode: 'Inverted' }
                });

                const playArgs = mockController.play.mock.calls[0][1];
                expect(playArgs.offset).toBeCloseTo(4.0);
            });

            it('should fallback to Normal (None) behavior if offsetMode is None', () => {
                manager.playLoop('battle_music' as SoundId, 'source_region' as RegionId);

                const track = (manager as any).tracks.get('battle_music');
                track.gridStartTime = 0;
                simulatedTime = 0.5;

                mockController.play.mockClear();

                manager.transitionTo({
                    soundId: 'battle_music' as SoundId,
                    targetRegion: 'target_region' as RegionId,
                    options: { quantize: 'Immediate', offsetMode: 'None' }
                });

                const playArgs = mockController.play.mock.calls[0][1];

                expect(playArgs.offset).toBeCloseTo(1.0);
                expect(playArgs.when).toBe(0);
            });
        });
    });
});
