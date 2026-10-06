// oxlint-disable no-underscore-dangle
// noinspection D

import type { IEngineTicker } from '@domain/Shared/Ports/IEngineTicker.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { Mocked } from 'vitest';

import AudioGrid from '@domain/Orchestration/AudioGrid';
import { LoopState } from '@domain/Orchestration/Ports/ISequencer.js';
import Sequencer from '@domain/Orchestration/Sequencer.js';
import {
    Beats,
    ContextTime,
    Milliseconds,
    PlaybackId,
    Pulses,
    RegionId,
    Seconds,
    SoundId,
    TimeMath
} from '@scene-grid/shared';
import { AudioContext as MockAudioContext, registrar } from 'standardized-audio-context-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../AudioGrid', () => {
    const MockGrid = vi.fn();
    MockGrid.prototype.getNextBeatTime = vi.fn().mockReturnValue(1.5);
    MockGrid.prototype.getNextBarTime = vi.fn().mockReturnValue(2);
    return { default: MockGrid };
});

describe('Sequencer (Interactive Music)', () => {
    let mockContext: MockAudioContext;
    let simulatedTime: ContextTime;

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

        simulatedTime = 0 as ContextTime;
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
            play: vi.fn().mockReturnValue(1),
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
            performCrossfade: vi.fn(),
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

    function triggerTick(deltaTimeMs: Milliseconds = 25 as Milliseconds) {
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

        simulatedTime = 0.95 as ContextTime;
        triggerTick();

        expect(mockController.play).toHaveBeenCalledTimes(1);
        const arguments_ = mockController.play.mock.calls[0];

        expect(arguments_[0]).toBe('battle_music');
        expect(arguments_[1].when).toBeCloseTo(1, 5);
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
        simulatedTime = 0.5 as ContextTime;

        manager.transitionTo({
            soundId: 'battle_music' as SoundId,
            targetRegion: 'main' as RegionId,
            transitionRegionName: '' as RegionId,
            options: { quantize: 'Immediate', crossfadeDuration: 1000 as Milliseconds }
        });

        expect(mockController.fadeVolume).toHaveBeenCalledWith(1, 0, 1000, 'equal-power', 0);
        expect(mockController.stopById).toHaveBeenCalledWith(1, 1.5);

        const transitionCall = mockController.play.mock.calls[1];
        expect(transitionCall[0]).toBe('battle_music');
        expect(transitionCall[1]).toEqual({
            when: 0.5,
            offset: 1,
            duration: 2
        });
    });

    it('should perform FILL transition with equal-power crossfade for both regions', () => {
        mockController.play.mockReturnValueOnce(1);

        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

        mockController.play.mockClear();
        mockController.setVolume.mockClear();
        mockController.fadeVolume.mockClear();
        simulatedTime = 0.5 as ContextTime;
        vi.mocked(mockController.getCurrentTime).mockReturnValue(0.5);

        mockController.play.mockReturnValueOnce(2);

        manager.transitionTo({
            soundId: 'battle_music' as SoundId,
            targetRegion: 'main' as RegionId,
            transitionRegionName: 'fill' as RegionId,
            options: { quantize: 'Immediate', crossfadeDuration: 4000 as Milliseconds }
        });

        expect(mockController.fadeVolume).toHaveBeenCalledWith(1, 0, 4000, 'equal-power', expect.any(Number));

        expect(mockController.play).toHaveBeenCalledWith('battle_music', expect.any(Object));
        expect(mockController.setVolume).toHaveBeenCalledWith(2, 0);
        expect(mockController.fadeVolume).toHaveBeenCalledWith(2, 1, 4000, 'equal-power', expect.any(Number));
    });

    it('should perform QUANTIZED transition using AudioGrid', () => {
        manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
        mockController.play.mockClear();
        simulatedTime = 0.8 as ContextTime;

        manager.transitionTo({
            soundId: 'battle_music' as SoundId,
            targetRegion: 'main' as RegionId,
            transitionRegionName: '' as RegionId,
            options: { quantize: 'NextBar' }
        });

        expect(mockController.play).not.toHaveBeenCalled();

        simulatedTime = 1.95 as ContextTime;
        triggerTick();

        expect(mockController.play).toHaveBeenCalledTimes(1);

        const arguments_ = mockController.play.mock.calls[0];
        expect(arguments_[1].when).toBeCloseTo(2, 5);
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
                crossfadeDuration: 0 as Milliseconds
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
            const track = (manager as any).getTrackContext('battle_music');
            track.state = LoopState.LOOPING;

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

        it('should correctly process ExactPulse quantization using AudioGrid PPQN math', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            const customGrid = {
                getPulseAtTime: vi.fn().mockReturnValue(960),
                getTimeAtPulse: vi.fn().mockReturnValue(0.75),
                getNextBeatTime: vi.fn(),
                getNextBarTime: vi.fn()
            } as any;

            simulatedTime = 0.5 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: {
                    quantize: { type: 'ExactPulse', pulseOffset: 480 as Pulses },
                    grid: customGrid
                }
            });

            expect(customGrid.getPulseAtTime).toHaveBeenCalledTimes(1);
            expect(customGrid.getPulseAtTime).toHaveBeenCalledWith(0.5);

            expect(customGrid.getTimeAtPulse).toHaveBeenCalledTimes(1);
            expect(customGrid.getTimeAtPulse).toHaveBeenCalledWith(1440);

            const track = (manager as any).getTrackContext('battle_music');
            expect(track.nextScheduleTime).toBe(0.75);
        });
    });

    describe('Quantization Types Pattern Matching (PPQN Data-Plane)', () => {
        let customGrid: any;

        beforeEach(() => {
            customGrid = {
                ppqn: 960,
                getPulseAtTime: vi.fn().mockReturnValue(960),
                getTimeAtPulse: vi.fn().mockImplementation(pulse => pulse / 1000),
                getNextBeatTime: vi.fn(),
                getNextBarTime: vi.fn(),
                getNextDivisionTime: vi.fn()
            };

            mockController.getCurrentTime.mockReturnValue(0.96);
        });

        describe('transitionTo() PPQN Math', () => {
            beforeEach(() => {
                manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            });

            it('should delegate 1/8 note division calculation to grid.getNextDivisionTime', () => {
                customGrid.getNextDivisionTime.mockReturnValue(1.44);

                manager.transitionTo({
                    soundId: 'battle_music' as SoundId,
                    targetRegion: 'main' as RegionId,
                    options: {
                        quantize: { type: 'NextGridDivision', division: '1/8' },
                        grid: customGrid
                    }
                });

                expect(customGrid.getNextDivisionTime).toHaveBeenCalledWith(0.96, '1/8');

                const track = (manager as any).getTrackContext('battle_music');
                expect(track.nextScheduleTime).toBe(1.44);
            });

            it('should delegate 1/32 note division calculation to grid.getNextDivisionTime', () => {
                customGrid.getNextDivisionTime.mockReturnValue(1.08);

                manager.transitionTo({
                    soundId: 'battle_music' as SoundId,
                    targetRegion: 'main' as RegionId,
                    options: {
                        quantize: { type: 'NextGridDivision', division: '1/32' },
                        grid: customGrid
                    }
                });

                expect(customGrid.getNextDivisionTime).toHaveBeenCalledWith(0.96, '1/32');

                const track = (manager as any).getTrackContext('battle_music');
                expect(track.nextScheduleTime).toBe(1.08);
            });
        });

        describe('playStinger() PPQN Math', () => {
            beforeEach(() => {
                vi.spyOn(manager, 'getPlaybackInfo').mockReturnValue({
                    grid: customGrid
                } as any);

                manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
                mockRouter.play.mockClear();
            });

            it('should schedule stinger strictly using ExactPulse offset', () => {
                manager.playStinger('victory_chord' as SoundId, { type: 'ExactPulse', pulseOffset: 300 as Pulses });

                expect(customGrid.getPulseAtTime).toHaveBeenCalledWith(0.96);
                expect(customGrid.getTimeAtPulse).toHaveBeenCalledWith(1260);

                expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', {
                    when: 1.26
                });
            });

            it('should delegate Next 1/16 Grid Division to grid.getNextDivisionTime', () => {
                customGrid.getNextDivisionTime.mockReturnValue(1.2);

                manager.playStinger('victory_chord' as SoundId, { type: 'NextGridDivision', division: '1/16' });

                expect(customGrid.getNextDivisionTime).toHaveBeenCalledWith(0.96, '1/16');

                expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', {
                    when: 1.2
                });
            });
        });
    });

    describe('Pickups (preEntry) Logic', () => {
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

            simulatedTime = 0 as ContextTime;
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

            simulatedTime = 9.7 as ContextTime;

            (manager as any).scheduleRegion({
                soundId: 'battle_music',
                regionName: 'pickup_region',
                targetTime: 10.0,
                track
            });

            expect(mockController.play).toHaveBeenCalledTimes(1);
            const playArgs = mockController.play.mock.calls[0][1];

            expect(playArgs.when).toBe(9.7);
            expect(playArgs.offset).toBeCloseTo(0.7);

            expect(track.nextScheduleTime).toBeCloseTo(12.0);
        });
    });

    describe('Musical Overlap & Tails (tailDuration) Logic', () => {
        it('should append tail to the physical duration of the scheduled region without shifting the grid', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: {
                        tail_region: [44_100, 88_200, 0, 1500]
                    }
                }
            });

            simulatedTime = 0 as ContextTime;
            manager.playLoop('battle_music' as SoundId, 'tail_region' as RegionId);

            expect(mockController.play).toHaveBeenCalledTimes(1);
            const playArgs = mockController.play.mock.calls[0][1];

            expect(playArgs.duration).toBeCloseTo(2.5);

            const track = (manager as any).tracks.get('battle_music');
            expect(track.nextScheduleTime).toBeCloseTo(1.0);
        });

        it('should perform MUSICAL OVERLAP transition when tailDuration is provided', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            simulatedTime = 0.5 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                transitionRegionName: '' as RegionId,
                options: { quantize: 'Immediate', tailDuration: 2000 as Milliseconds }
            });

            expect(mockController.fadeVolume).not.toHaveBeenCalled();
            expect(mockController.stopById).toHaveBeenCalledWith(1, 2.5);

            const transitionCall = mockController.play.mock.calls[1];
            expect(transitionCall[0]).toBe('battle_music');
            expect(transitionCall[1]).toEqual({
                when: 0.5,
                offset: 1,
                duration: 2
            });
        });
    });

    describe('Stingers (playStinger) Logic', () => {
        beforeEach(() => {
            mockRouter.play.mockClear();
        });

        it('should play stinger immediately if quantize is Immediate', () => {
            manager.playStinger('victory_chord' as SoundId, 'Immediate');
            expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', { delay: 0 });
        });

        it('should play stinger immediately if no looping track is active', () => {
            manager.playStinger('victory_chord' as SoundId, 'NextBar');
            expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', { delay: 0 });
        });

        it('should quantize stinger to NextBeat using the active track grid', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            mockRouter.play.mockClear();
            simulatedTime = 1.0 as ContextTime;

            manager.playStinger('victory_chord' as SoundId, 'NextBeat');

            expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', { when: 1.5 });
        });

        it('should quantize stinger to NextBar using the explicit reference track', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            mockRouter.play.mockClear();
            simulatedTime = 0.5 as ContextTime;

            manager.playStinger('victory_chord' as SoundId, 'NextBar', 'battle_music' as SoundId);

            expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', { when: 2 });
        });
    });

    describe('Magnet Regions Evaluation', () => {
        it('should evaluate magnets via TransitionPolicy on tick when in a looping state', () => {
            const config = mockRouter.getSoundConfig();

            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            mockTransitionPolicy.evaluate.mockClear();

            triggerTick();

            expect(mockTransitionPolicy.evaluate).toHaveBeenCalledTimes(1);
            expect(mockTransitionPolicy.evaluate).toHaveBeenCalledWith(config, 'intro', expect.any(Array));
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

            it('should apply Relative offset correctly and ignore preEntry', () => {
                manager.playLoop('battle_music' as SoundId, 'source_region' as RegionId);

                const track = (manager as any).tracks.get('battle_music');
                track.gridStartTime = 0;
                simulatedTime = 0.5 as ContextTime;

                mockController.play.mockClear();

                manager.transitionTo({
                    soundId: 'battle_music' as SoundId,
                    targetRegion: 'target_region' as RegionId,
                    options: { quantize: 'Immediate', offsetMode: 'Relative' }
                });

                expect(mockController.play).toHaveBeenCalledTimes(1);
                const playArgs = mockController.play.mock.calls[0][1];

                expect(playArgs.offset).toBeCloseTo(2.0);
                expect(playArgs.when).toBe(0.5);
            });

            it('should apply Inverted offset correctly', () => {
                manager.playLoop('battle_music' as SoundId, 'source_region' as RegionId);

                const track = (manager as any).tracks.get('battle_music');
                track.gridStartTime = 0;
                simulatedTime = 0.5 as ContextTime;

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
                simulatedTime = 0.5 as ContextTime;

                mockController.play.mockClear();

                manager.transitionTo({
                    soundId: 'battle_music' as SoundId,
                    targetRegion: 'target_region' as RegionId,
                    options: { quantize: 'Immediate', offsetMode: 'None' }
                });

                const playArgs = mockController.play.mock.calls[0][1];

                expect(playArgs.offset).toBeCloseTo(1.0);
                expect(playArgs.when).toBe(0.5);
            });
        });
    });

    describe('stopLoop and destroy cleanup', () => {
        it('should unsubscribe from active voice ended listeners when a loop is stopped', () => {
            const mockUnsubscribe = vi.fn();
            mockController.onVoiceEnded.mockReturnValue(mockUnsubscribe);
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            manager.stopLoop('battle_music' as SoundId);

            expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
        });

        it('should remove the "sequencer" task identifier from ticker on destroy', () => {
            manager.destroy();

            expect(mockTicker.remove).toHaveBeenCalledWith('sequencer');
        });
    });

    describe('transitionTo guards and options defaults', () => {
        it('should ignore transition request when track is in IDLE state', () => {
            mockController.play.mockClear();

            manager.transitionTo({
                soundId: 'idle_track' as SoundId,
                targetRegion: 'main' as RegionId
            });

            expect(mockController.play).not.toHaveBeenCalled();
        });

        it('should default options to Immediate quantize when options argument is omitted', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            mockController.play.mockClear();
            simulatedTime = 0.5 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId
            });

            expect(mockController.play).toHaveBeenCalledWith('battle_music', expect.objectContaining({ when: 0.5 }));
        });

        it('should increment track playId upon initiating a transition', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            const playIdBefore = track.playId;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'Immediate' }
            });

            expect(track.playId).toBe(playIdBefore + 1);
        });
    });

    describe('transitionTo grid math and defaults', () => {
        it('should construct AudioGrid using configured bpm, beatsPerBar, and custom ppqn', async () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 140,
                    beatsPerBar: 3,
                    regions: { intro: [0, 44_100], main: [44_100, 132_300] }
                }
            });

            const customSequencer = new Sequencer(
                mockController,
                mockRouter,
                mockTicker,
                mockTransitionPolicy,
                480 as Pulses
            );

            customSequencer.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            customSequencer.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBar' }
            });

            const AudioGridMock = (await import('../AudioGrid')).default as any;
            expect(AudioGridMock).toHaveBeenCalledWith(140, 3, expect.any(Number), 480);

            customSequencer.destroy();
        });

        it('should update grid anchor time from active region when scheduledStartTime <= now', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 0 as Seconds;

            track.activeRegions.add({
                playbackId: 1 as PlaybackId,
                scheduledStartTime: 2.0 as Seconds,
                unsubscribe: () => {}
            });

            simulatedTime = 2.5 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBeat' }
            });

            const AudioGridMock = vi.mocked(AudioGrid as any);
            expect(AudioGridMock).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 2.0, expect.any(Number));
        });

        it('should not override ExactPulse quantization with NextGridDivision', () => {
            const customGrid = {
                getPulseAtTime: vi.fn().mockReturnValue(960),
                getTimeAtPulse: vi.fn().mockReturnValue(1.5),
                getNextDivisionTime: vi.fn()
            } as any;

            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: {
                    quantize: { type: 'ExactPulse', pulseOffset: 480 as Pulses },
                    grid: customGrid
                }
            });

            expect(customGrid.getTimeAtPulse).toHaveBeenCalledWith(1440);
            expect(customGrid.getNextDivisionTime).not.toHaveBeenCalled();
        });
    });

    describe('transitionTo crossfading and cancellation', () => {
        it('should fallback to config.smartLoop.crossfade during non-Immediate transition when crossfadeDuration option is missing', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            simulatedTime = 0.5 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBar' }
            });

            simulatedTime = 2.0 as ContextTime;
            triggerTick();

            expect(mockController.fadeVolume).toHaveBeenCalledWith(1, 0, 500, 'equal-power', expect.any(Number));
        });

        it('should cancel scheduled active region when scheduledStartTime >= targetTime', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            const mockUnsub = vi.fn();

            track.activeRegions.add({
                playbackId: 5 as PlaybackId,
                scheduledStartTime: 2.0 as Seconds,
                unsubscribe: mockUnsub
            });

            simulatedTime = 0.5 as ContextTime;
            const customGrid = { getNextBarTime: vi.fn().mockReturnValue(2.0) } as any;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBar', grid: customGrid }
            });

            expect(mockUnsub).toHaveBeenCalledTimes(1);
            expect(mockController.cancelScheduled).toHaveBeenCalledWith(5);
        });

        it('should stop active region at targetTime when tailDuration is explicitly 0ms', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.activeRegions.add({
                playbackId: 8 as PlaybackId,
                scheduledStartTime: 0.0 as Seconds,
                unsubscribe: () => {}
            });

            simulatedTime = 0.5 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'Immediate', tailDuration: 0 as Milliseconds }
            });

            expect(mockController.stopById).toHaveBeenCalledWith(8, 0.5);
        });
    });

    describe('transitionTo offsetMode phase calculation', () => {
        it('should compute target startOffsetSec from source region phase', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: {
                        source_region: [0, 88_200],
                        target_region: [0, 176_400]
                    }
                }
            });

            manager.playLoop('battle_music' as SoundId, 'source_region' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 1.0 as Seconds;

            simulatedTime = 2.0 as ContextTime;

            mockController.play.mockClear();

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'target_region' as RegionId,
                options: { quantize: 'Immediate', offsetMode: 'Relative' }
            });

            expect(mockController.play).toHaveBeenCalledWith('battle_music', expect.objectContaining({ offset: 2.0 }));
        });
    });

    describe('playStinger defaults and Immediate execution', () => {
        it('should default quantize parameter to NextBeat when unspecified', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            mockRouter.play.mockClear();
            simulatedTime = 1.0 as ContextTime;

            manager.playStinger('victory_stinger' as SoundId);

            expect(mockRouter.play).toHaveBeenCalledWith('victory_stinger', { when: 1.5 });
        });

        it('should trigger immediate play with delay=0 when quantize is "Immediate"', () => {
            mockRouter.play.mockClear();

            manager.playStinger('victory_stinger' as SoundId, 'Immediate');

            expect(mockRouter.play).toHaveBeenCalledTimes(1);
            expect(mockRouter.play).toHaveBeenCalledWith('victory_stinger', { delay: 0 });
        });
    });

    describe('getPlaybackInfo', () => {
        it('should return null when track does not exist or is not in LOOPING state', () => {
            expect(manager.getPlaybackInfo('non_existent' as SoundId)).toBeNull();

            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            manager.stopLoop('battle_music' as SoundId);
            expect(manager.getPlaybackInfo('battle_music' as SoundId)).toBeNull();
        });

        it('should return null when sound config is missing or lacks smartLoop definition', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            mockRouter.getSoundConfig.mockReturnValueOnce({ busId: 'music' });

            expect(manager.getPlaybackInfo('battle_music' as SoundId)).toBeNull();
        });

        it('should return valid IPlaybackInfo instance when track is actively looping', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            const info = manager.getPlaybackInfo('battle_music' as SoundId);

            expect(info).not.toBeNull();
            expect(info?.soundId).toBe('battle_music');
            expect(info?.state).toBe(LoopState.LOOPING);
        });
    });

    describe('getMusicSnapshot', () => {
        it('should return empty array when no tracks are active or all are IDLE', () => {
            expect(manager.getMusicSnapshot()).toEqual([]);
        });

        it('should reflect current region, target region, and queue length in snapshot', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                transitionRegionName: 'fill' as RegionId,
                options: { quantize: 'NextBar' }
            });

            const snapshots = manager.getMusicSnapshot();

            expect(snapshots).toHaveLength(1);
            expect(snapshots[0]).toEqual({
                soundId: 'battle_music',
                state: LoopState.TRANSITIONING,
                currentRegion: 'main',
                targetRegion: 'fill',
                queueLength: 2
            });
        });

        it('should recycle snapshot instances from pool across multiple queries', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            const snapshotsCall1 = manager.getMusicSnapshot();
            const firstReference = snapshotsCall1[0];

            const snapshotsCall2 = manager.getMusicSnapshot();

            expect(snapshotsCall2[0]).toBe(firstReference);
            expect(snapshotsCall2).toHaveLength(1);
        });
    });

    describe('Telemetry Dispatching', () => {
        it('should dispatch CAUSE_CHAIN telemetry event when magnet transition is triggered', () => {
            const mockTelemetry = { dispatch: vi.fn() };
            const telemetrySequencer = new Sequencer(
                mockController,
                mockRouter,
                mockTicker,
                mockTransitionPolicy,
                960 as Pulses,
                mockTelemetry as any
            );

            telemetrySequencer.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            mockTransitionPolicy.evaluate.mockReturnValue({
                targetRegion: 'main',
                transitionRegionName: '',
                options: { quantize: 'NextBeat' },
                trace: ['magnet_condition_met']
            });

            if (capturedTickTarget) {
                capturedTickTarget.tick(simulatedTime, 25 as Milliseconds);
            }

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'CAUSE_CHAIN',
                timestampMs: expect.any(Number),
                initiator: {
                    type: 'MAGNET',
                    sourceRegion: 'intro',
                    targetRegion: 'main'
                },
                result: {
                    type: 'TRANSITION',
                    target: 'battle_music',
                    toRegion: 'main'
                },
                conditionTrace: ['magnet_condition_met']
            });

            telemetrySequencer.destroy();
        });
    });

    describe('tick crossfading and volume fading execution', () => {
        it('should invoke router.performCrossfade when scheduling a region during TRANSITIONING with pre-existing active regions', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            const track = (manager as any).getTrackContext('battle_music');
            track.state = LoopState.TRANSITIONING;

            track.activeRegions.add({
                playbackId: 10 as PlaybackId,
                scheduledStartTime: 0 as Seconds,
                unsubscribe: () => {}
            });

            track.regionQueue = [{ name: 'main' as RegionId, fadeInDuration: 500 as Milliseconds }];

            track.nextScheduleTime = 0 as Seconds;

            manager.tick();

            expect(mockRouter.performCrossfade).toHaveBeenCalledWith(10, expect.any(Number), 500);
        });

        it('should set volume to 0 and apply equal-power fade curve when scheduling region in LOOPING state with fadeInMs > 0', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.state = LoopState.LOOPING;

            track.regionQueue.push({ name: 'main' as RegionId, fadeInDuration: 1000 as Milliseconds });

            mockController.setVolume.mockClear();
            mockController.fadeVolume.mockClear();

            simulatedTime = 0.95 as ContextTime;

            triggerTick();

            expect(mockController.setVolume).toHaveBeenCalledWith(expect.any(Number), 0);
            expect(mockController.fadeVolume).toHaveBeenCalledWith(
                expect.any(Number),
                1,
                1000,
                'equal-power',
                expect.any(Number)
            );
        });
    });

    describe('scheduleRegion offset overrides and late execution', () => {
        it('should ignore preEntry when startOffsetSec is greater than 0', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: { pickup_region: [0, 88_200, 500] }
                }
            });

            manager.playLoop('battle_music' as SoundId, 'pickup_region' as RegionId);
            mockController.play.mockClear();

            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 0 as Seconds;
            simulatedTime = 0.5 as ContextTime;

            (manager as any).scheduleRegion({
                soundId: 'battle_music',
                regionName: 'pickup_region',
                targetTime: 0.5,
                track,
                startOffsetSec: 1.0 as Seconds
            });

            expect(mockController.play).toHaveBeenCalledWith('battle_music', expect.objectContaining({ offset: 1.0 }));
        });

        it('should drop pre-entry and start main region at offset 0 when now === targetTime', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: { pickup_region: [0, 88_200, 500] }
                }
            });

            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 0.0 as Seconds;

            simulatedTime = 1.0 as ContextTime;

            (manager as any).scheduleRegion({
                soundId: 'battle_music',
                regionName: 'pickup_region',
                targetTime: 1.0,
                track
            });

            expect(mockController.play).toHaveBeenCalledWith('battle_music', {
                when: 1.0,
                offset: 0,
                duration: 2
            });
        });

        it('should unsubscribe voice ended listener when voice ends', () => {
            const mockUnsubscribe = vi.fn();
            mockController.onVoiceEnded.mockImplementation((id: PlaybackId, callback: () => void) => {
                capturedOnVoiceEnded = callback;
                return mockUnsubscribe;
            });

            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            expect(capturedOnVoiceEnded).not.toBeNull();
            capturedOnVoiceEnded!();

            expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
        });
    });

    describe('stopLoop counter updates', () => {
        it('should increment track playId when loop is stopped', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            const playIdBefore = track.playId;

            manager.stopLoop('battle_music' as SoundId);

            expect(track.playId).toBe(playIdBefore + 1);
        });
    });

    describe('transitionTo quantization interval and anchor time', () => {
        it('should pass explicit quantizeInterval to grid.getNextBeatTime', () => {
            const customGrid = { getNextBeatTime: vi.fn().mockReturnValue(5.0) } as any;
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBeat', quantizeInterval: 4 as Beats, grid: customGrid }
            });

            expect(customGrid.getNextBeatTime).toHaveBeenCalledWith(expect.any(Number), 4);
        });

        it('should preserve positive gridStartTime when no active region has scheduledStartTime <= now', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 5.0 as Seconds;
            track.activeRegions.clear();
            simulatedTime = 2.0 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBeat' }
            });

            const AudioGridMock = vi.mocked(AudioGrid as any);
            expect(AudioGridMock).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 5.0, expect.any(Number));
        });

        it('should set anchorTime when scheduledStartTime is exactly equal to now', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 1.0 as Seconds;
            track.activeRegions.add({
                playbackId: 1 as PlaybackId,
                scheduledStartTime: 2.0 as Seconds,
                unsubscribe: () => {}
            });
            simulatedTime = 2.0 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBeat' }
            });

            const AudioGridMock = vi.mocked(AudioGrid as any);
            expect(AudioGridMock).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 2.0, expect.any(Number));
        });

        it('should NOT use future active region scheduledStartTime when scheduledStartTime > now', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 1.0 as Seconds;
            track.activeRegions.clear();

            track.activeRegions.add({
                playbackId: 1 as PlaybackId,
                scheduledStartTime: 10.0 as Seconds,
                unsubscribe: () => {}
            });

            simulatedTime = 2.0 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'NextBeat' }
            });

            const AudioGridMock = vi.mocked(AudioGrid as any);
            expect(AudioGridMock).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 1.0, expect.any(Number));
        });
    });

    describe('transitionTo tailDuration behavior', () => {
        it('should NOT invoke TimeMath.addTime when tailDuration is explicitly 0ms', () => {
            const addTimeSpy = vi.spyOn(TimeMath, 'addTime');
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.activeRegions.add({
                playbackId: 8 as PlaybackId,
                scheduledStartTime: 0.0 as Seconds,
                unsubscribe: () => {}
            });
            simulatedTime = 0.5 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'Immediate', tailDuration: 0 as Milliseconds }
            });

            expect(addTimeSpy).not.toHaveBeenCalled();
            addTimeSpy.mockRestore();
        });
    });

    describe('transitionTo offsetMode edge cases', () => {
        it('should compute correct source length when start sample is non-zero', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: {
                        source_region: [44_100, 132_300],
                        target_region: [0, 176_400]
                    }
                }
            });

            manager.playLoop('battle_music' as SoundId, 'source_region' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 0.5 as Seconds;
            simulatedTime = 2.0 as ContextTime;

            mockController.play.mockClear();

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'target_region' as RegionId,
                options: { quantize: 'Immediate', offsetMode: 'Relative' }
            });

            const playCall = mockController.play.mock.calls[0][1];
            expect(playCall.offset).toBeCloseTo(3.0);
        });

        it('should safely skip offset calculation when sourceRegion is undefined', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: { target_region: [0, 88_200] }
                }
            });

            manager.playLoop('battle_music' as SoundId, 'non_existent_source' as RegionId);

            expect(() => {
                manager.transitionTo({
                    soundId: 'battle_music' as SoundId,
                    targetRegion: 'target_region' as RegionId,
                    options: { quantize: 'Immediate', offsetMode: 'Relative' }
                });
            }).not.toThrow();
        });

        it('should ignore offset calculation if sourceLenSec is zero', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: {
                        zero_len_region: [44_100, 44_100],
                        target_region: [0, 88_200]
                    }
                }
            });

            manager.playLoop('battle_music' as SoundId, 'zero_len_region' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 0 as Seconds;
            simulatedTime = 1.0 as ContextTime;

            mockController.play.mockClear();

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'target_region' as RegionId,
                options: { quantize: 'Immediate', offsetMode: 'Relative' }
            });

            const playCall = mockController.play.mock.calls[0][1];
            expect(playCall.offset).not.toBeNaN();
            expect(playCall.offset).toBe(0);
        });

        it('should correctly populate targetRegion in transition queue when transitionRegionName is specified', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: {
                        source_region: [0, 88_200],
                        fill: [0, 44_100],
                        target_region: [0, 88_200]
                    }
                }
            });

            manager.playLoop('battle_music' as SoundId, 'source_region' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'target_region' as RegionId,
                transitionRegionName: 'fill' as RegionId,
                options: { quantize: 'Immediate' }
            });

            simulatedTime = 1.0 as ContextTime;
            track.nextScheduleTime = 1.0 as Seconds;
            mockController.play.mockClear();
            triggerTick();

            expect(mockController.play).toHaveBeenCalledWith('battle_music', expect.objectContaining({ offset: 0 }));
        });
    });

    describe('playStinger immediate and reference track logic', () => {
        it('should return immediately with delay=0 even when an active looping track exists', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            mockRouter.play.mockClear();

            manager.playStinger('stinger' as SoundId, 'Immediate');

            expect(mockRouter.play).toHaveBeenCalledTimes(1);
            expect(mockRouter.play).toHaveBeenCalledWith('stinger', { delay: 0 });
        });

        it('should resolve refTrackId from active looping track when referenceTrackId parameter is omitted', () => {
            manager.playLoop('active_loop' as SoundId, 'intro' as RegionId);
            mockRouter.play.mockClear();
            simulatedTime = 1.0 as ContextTime;

            manager.playStinger('stinger' as SoundId, 'NextBeat');

            expect(mockRouter.play).toHaveBeenCalledWith('stinger', { when: 1.5 });
        });

        it('should execute ExactPulse without falling through to NextGridDivision', () => {
            const customGrid = {
                getPulseAtTime: vi.fn().mockReturnValue(960),
                getTimeAtPulse: vi.fn().mockReturnValue(1.25),
                getNextDivisionTime: vi.fn()
            };
            vi.spyOn(manager, 'getPlaybackInfo').mockReturnValue({ grid: customGrid } as any);
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            mockRouter.play.mockClear();

            manager.playStinger('stinger' as SoundId, { type: 'ExactPulse', pulseOffset: 240 as Pulses });

            expect(customGrid.getTimeAtPulse).toHaveBeenCalledWith(1200);
            expect(customGrid.getNextDivisionTime).not.toHaveBeenCalled();
            expect(mockRouter.play).toHaveBeenCalledWith('stinger', { when: 1.25 });
        });
    });

    describe('getPlaybackInfo defaults', () => {
        it('should return null when track gridStartTime is null', () => {
            const track = (manager as any).getTrackContext('unscheduled_track');
            track.state = LoopState.LOOPING;
            track.gridStartTime = null;

            expect(manager.getPlaybackInfo('unscheduled_track' as SoundId)).toBeNull();
        });

        it('should pass explicit bpm and beatsPerBar from sound config to AudioGrid', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 140,
                    beatsPerBar: 3,
                    regions: { intro: [0, 44_100] }
                }
            });

            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            const info = manager.getPlaybackInfo('battle_music' as SoundId);

            expect(info).not.toBeNull();
            const AudioGridMock = vi.mocked(AudioGrid as any);
            expect(AudioGridMock).toHaveBeenCalledWith(140, 3, expect.any(Number), expect.any(Number));
        });
    });

    describe('getMusicSnapshot pooling and state filtering', () => {
        it('should exclude tracks in IDLE state', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            manager.stopLoop('battle_music' as SoundId);

            const snapshots = manager.getMusicSnapshot();

            expect(snapshots).toHaveLength(0);
        });

        it('should reuse snapshotPool elements when pool capacity is sufficient', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            manager.getMusicSnapshot();

            const poolPushSpy = vi.spyOn((manager as any).snapshotManager.snapshotPool, 'push');

            const snapshotsCall2 = manager.getMusicSnapshot();

            expect(poolPushSpy).not.toHaveBeenCalled();
            expect(snapshotsCall2).toHaveLength(1);
            expect(snapshotsCall2[0].soundId).toBe('battle_music');
            poolPushSpy.mockRestore();
        });
    });

    describe('tick processing boundaries and track initialization', () => {
        it('should initialize empty regionQueue and magnetStates arrays on new track context', () => {
            const track = (manager as any).getTrackContext('fresh_track');

            expect(track.regionQueue).toEqual([]);
            expect(track.magnetStates).toEqual([]);
        });

        it('should call setVolume(playbackId, 1) when region is scheduled without fade', () => {
            mockController.setVolume.mockClear();

            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            expect(mockController.setVolume).toHaveBeenCalledWith(expect.any(Number), 1);
        });

        it('should terminate tick while loop when nextScheduleTime equals scheduleHorizon', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.nextScheduleTime = 0.1 as Seconds;

            mockController.play.mockClear();

            triggerTick();

            expect(mockController.play).not.toHaveBeenCalled();
        });

        it('should NOT terminate loop prematurely when schedule progress is valid', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: {
                        short1: [0, 1_000],
                        short2: [0, 1_000]
                    }
                }
            });

            manager.playLoop('battle_music' as SoundId, 'short1' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');

            track.nextScheduleTime = 0 as Seconds;
            track.loopRegion = null;
            track.regionQueue = [
                { name: 'short1' as RegionId, fadeInDuration: 0 as Milliseconds },
                { name: 'short2' as RegionId, fadeInDuration: 0 as Milliseconds }
            ];

            mockController.play.mockClear();

            triggerTick();

            expect(mockController.play).toHaveBeenCalledTimes(2);
        });
    });

    describe('scheduleRegion late execution edge cases', () => {
        it('should set preEntrySec to 0 when safeStartOffsetSec is positive', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: { pickup_region: [0, 88_200, 500] }
                }
            });

            manager.playLoop('battle_music' as SoundId, 'pickup_region' as RegionId);
            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 0 as Seconds;

            simulatedTime = 0.5 as ContextTime;
            mockController.play.mockClear();

            (manager as any).scheduleRegion({
                soundId: 'battle_music',
                regionName: 'pickup_region',
                targetTime: 0.5,
                track,
                startOffsetSec: 1.0 as Seconds
            });

            const playCall = mockController.play.mock.calls[0][1];
            expect(playCall.offset).toBe(1.0);
        });

        it('should NOT trigger initial time-0 logic when gridStartTime is already defined', () => {
            mockRouter.getSoundConfig.mockReturnValue({
                busId: 'music',
                smartLoop: {
                    bpm: 120,
                    regions: { pickup_region: [0, 88_200, 500] }
                }
            });

            const track = (manager as any).getTrackContext('battle_music');
            track.gridStartTime = 1.0 as Seconds;

            simulatedTime = 0.8 as ContextTime;

            (manager as any).scheduleRegion({
                soundId: 'battle_music',
                regionName: 'pickup_region',
                targetTime: 0 as Seconds,
                track
            });

            expect(track.nextScheduleTime).not.toBe(1.3);
        });
        describe('Refactoring Coverage Recovery', () => {
            it('should execute stopLoop properly and clear properties', () => {
                manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
                manager.stopLoop('battle_music' as SoundId);
                const track = (manager as any).tracks.get('battle_music');
                expect(track.nextScheduleTime).toBe(0);
            });

            it('should catch and log error when cancelScheduled throws during transition', () => {
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
                simulatedTime = 0 as ContextTime;

                const track = (manager as any).tracks.get('battle_music');
                track.activeRegions.forEach((r: any) => {
                    r.scheduledStartTime = 10;
                });

                mockController.cancelScheduled.mockImplementation(() => {
                    throw new Error('cancel error');
                });

                manager.transitionTo({
                    soundId: 'battle_music' as SoundId,
                    targetRegion: 'main' as RegionId,
                    options: { quantize: 'Immediate' }
                });

                expect(warnSpy).toHaveBeenCalledWith(
                    '[Sequencer] Failed to cancel scheduled region during transition',
                    expect.any(Error)
                );
                warnSpy.mockRestore();
            });

            it('should catch and log error when unsubscribe throws on voice ended', () => {
                const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
                manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

                const track = (manager as any).tracks.get('battle_music');
                const activeRegion = [...track.activeRegions][0];
                activeRegion.unsubscribe = () => {
                    throw new Error('unsubscribe error');
                };

                capturedOnVoiceEnded!();

                expect(warnSpy).toHaveBeenCalledWith(
                    '[Sequencer] Failed to unsubscribe voice end handler',
                    expect.any(Error)
                );
                warnSpy.mockRestore();
            });

            it('should fallback to returning now when stinger quantize type is unknown', () => {
                manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
                simulatedTime = 1.0 as ContextTime;

                manager.playStinger('victory_chord' as SoundId, { type: 'Unknown' } as any);

                expect(mockRouter.play).toHaveBeenCalledWith('victory_chord', { when: 1.0 });
            });
        });
        it('should catch and log error when unsubscribe throws during stopLoop', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            const track = (manager as any).tracks.get('battle_music');
            const activeRegion = [...track.activeRegions][0];
            activeRegion.unsubscribe = () => {
                throw new Error('stopLoop unsubscribe error');
            };

            manager.stopLoop('battle_music' as SoundId);

            expect(warnSpy).toHaveBeenCalledWith(
                '[Sequencer] Failed to unsubscribe during stopLoop',
                expect.any(Error)
            );
            warnSpy.mockRestore();
        });

        it('should catch and log error when cancelScheduled throws during stopLoop', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);

            mockController.cancelScheduled.mockImplementation(() => {
                throw new Error('stopLoop cancel error');
            });

            manager.stopLoop('battle_music' as SoundId);

            expect(warnSpy).toHaveBeenCalledWith(
                '[Sequencer] Failed to cancel scheduled region during stopLoop',
                expect.any(Error)
            );
            warnSpy.mockRestore();
        });

        it('should catch and log error when unsubscribe throws during transition', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            simulatedTime = 0.5 as ContextTime;

            const track = (manager as any).tracks.get('battle_music');
            const activeRegion = [...track.activeRegions][0];
            activeRegion.unsubscribe = () => {
                throw new Error('transition unsubscribe error');
            };

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: 'Immediate' }
            });

            expect(warnSpy).toHaveBeenCalledWith(
                '[Sequencer] Failed to unsubscribe during transition',
                expect.any(Error)
            );
            warnSpy.mockRestore();
        });

        it('should fallback to returning now when transition quantize type is unknown', () => {
            manager.playLoop('battle_music' as SoundId, 'intro' as RegionId);
            simulatedTime = 0.5 as ContextTime;

            manager.transitionTo({
                soundId: 'battle_music' as SoundId,
                targetRegion: 'main' as RegionId,
                options: { quantize: { type: 'UnknownType' } as any }
            });

            const track = (manager as any).tracks.get('battle_music');
            expect(track.nextScheduleTime).toBeCloseTo(2.5);
        });
    });
});
