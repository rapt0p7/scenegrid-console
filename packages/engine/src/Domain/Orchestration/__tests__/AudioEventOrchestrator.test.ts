/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D

import type { IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IBankManager } from '@domain/Shared/Ports/IBankManager.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type {
    BankId,
    ContextTime,
    EventId,
    GameParamId,
    IPRNG,
    LayerId,
    Milliseconds,
    PlaybackId,
    RegionId,
    SnapshotId,
    SoundId
} from '@scene-grid/shared';
import type { Mocked } from 'vitest';

import { MixerSnapshotManager, PRIORITY } from '@domain/Mixer/index.js';
import { AudioEventOrchestrator } from '@domain/Orchestration/AudioEventOrchestrator.js';
import { IAudioGrid } from '@domain/Orchestration/Ports/IAudioGrid';
import { ISequencer, LoopState } from '@domain/Orchestration/Ports/ISequencer.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testEventMap: IEventMap = {
    ['Player_Jump' as EventId]: {
        actions: [{ type: 'play', target: 'sfx_jump' as SoundId }]
    },
    ['Enter_Water' as EventId]: {
        actions: [
            { type: 'play', target: 'sfx_splash' as SoundId },
            { type: 'set_rtpc', param: 'is_underwater' as GameParamId, value: 1 }
        ]
    },
    ['Pause_Menu_Open' as EventId]: {
        actions: [
            { type: 'pause', target: 'bgm_level' as SoundId },
            { type: 'play', target: 'ui_menu_open' as SoundId }
        ]
    },
    ['Pause_Menu_Close' as EventId]: {
        actions: [{ type: 'resume', target: 'bgm_level' as SoundId }]
    },
    ['Boss_Defeated' as EventId]: {
        actions: [
            {
                type: 'stop',
                target: 'bgm_boss' as SoundId,
                options: { allowTail: true, fadeOut: 2000 as Milliseconds }
            },
            { type: 'play', target: 'jingle_victory' as SoundId }
        ]
    },
    ['Start_Combat_Music' as EventId]: {
        actions: [{ type: 'start_loop', target: 'bgm_combat' as SoundId, startRegion: 'intro' as RegionId }]
    },
    ['Stop_Combat_Music' as EventId]: {
        actions: [{ type: 'stop_loop', target: 'bgm_combat' as SoundId }]
    },
    ['Transition_To_Phase2' as EventId]: {
        actions: [
            {
                type: 'music_transition',
                target: 'bgm_combat' as SoundId,
                targetRegion: 'phase2' as RegionId,
                transitionRegionName: 'fill' as RegionId,
                options: { quantize: 'NextBar', offsetMode: 'Relative' }
            }
        ]
    },
    ['Play_Victory_Stinger' as EventId]: {
        actions: [
            {
                type: 'play_stinger',
                target: 'sfx_cymbal' as SoundId,
                quantize: 'NextBeat',
                referenceTrackId: 'bgm_combat' as SoundId
            }
        ]
    },
    ['Game_Paused' as EventId]: {
        actions: [{ type: 'set_mixer_state', snapshotName: 'snap_pause' as SnapshotId }]
    },
    ['Player_Stunned' as EventId]: {
        actions: [
            {
                type: 'add_mixer_modifier',
                snapshotName: 'snap_muffle' as SnapshotId,
                modifierId: 'stun_layer' as LayerId,
                priority: 50
            }
        ]
    },
    ['Player_Recovered' as EventId]: {
        actions: [{ type: 'remove_mixer_modifier', modifierId: 'stun_layer' as LayerId }]
    },
    ['Player_Nested' as EventId]: {
        actions: [
            { type: 'trigger_event', target: 'Player_Recovered' as EventId },
            { type: 'play', target: 'sfx_jump' as SoundId }
        ]
    },
    ['Player_Recursion' as EventId]: {
        actions: [{ type: 'trigger_event', target: 'Player_Recursion' as EventId }]
    },
    ['Event_With_Delay' as EventId]: {
        actions: [{ type: 'play', target: 'sfx_delayed' as SoundId, delay: 1500 as Milliseconds }]
    },
    ['Event_With_Probability' as EventId]: {
        actions: [
            { type: 'play', target: 'sfx_unlikely' as SoundId, probability: 0.2 },
            { type: 'play', target: 'sfx_likely' as SoundId, probability: 0.8 }
        ]
    },
    ['Event_With_Condition' as EventId]: {
        actions: [
            {
                type: 'play',
                target: 'sfx_low_hp' as SoundId,
                condition: { param: 'hp' as GameParamId, operator: '<', value: 50 }
            },
            {
                type: 'play',
                target: 'sfx_high_hp' as SoundId,
                condition: { param: 'hp' as GameParamId, operator: '>=', value: 50 }
            }
        ]
    },
    ['Event_With_Hysteresis' as EventId]: {
        actions: [
            {
                type: 'play',
                target: 'sfx_critical_hp' as SoundId,
                condition: { param: 'hp' as GameParamId, operator: '<', value: 20, hysteresis: 5 }
            }
        ]
    },
    ['Load_Level_Bank' as EventId]: {
        actions: [{ type: 'load_bank', target: 'Bank_Level1' as BankId }]
    },
    ['Unload_Level_Bank' as EventId]: {
        actions: [{ type: 'unload_bank', target: 'Bank_Level1' as BankId }]
    },
    ['Tagged_Play' as EventId]: {
        actions: [{ type: 'play', target: 'sfx_tagged' as SoundId, tags: ['cutscene'] } as any]
    },
    ['Tagged_Delayed' as EventId]: {
        actions: [
            {
                type: 'play',
                target: 'sfx_delayed_tagged' as SoundId,
                delay: 5000 as Milliseconds,
                tags: ['cutscene']
            } as any
        ]
    },
    ['Tagged_Loop' as EventId]: {
        actions: [{ type: 'start_loop', target: 'bgm_loop' as SoundId, tags: ['cutscene'] } as any]
    },
    ['Cancel_Cutscene' as EventId]: {
        actions: [{ type: 'cancel_pending', targetTags: ['cutscene'] } as any]
    },
    ['Multi_Delayed' as EventId]: {
        actions: [
            { type: 'play', target: 'sfx_seq_1' as SoundId, delay: 1000 as Milliseconds },
            { type: 'play', target: 'sfx_seq_2' as SoundId, delay: 2000 as Milliseconds }
        ]
    }
};

describe('AudioEventOrchestrator (State Machine & Telemetry)', () => {
    let mockRouter: Mocked<IAudioRouter>;
    let mockRtpcAdapter: Mocked<IRTPCAdapter>;
    let mockSequencer: Mocked<ISequencer>;
    let mockMixer: Mocked<MixerSnapshotManager>;
    let mockController: Mocked<ISoundController>;
    let mockPrng: Mocked<IPRNG>;
    let mockBankManager: Mocked<IBankManager>;
    let mockTelemetry: Mocked<ITelemetryDispatcher>;
    let dispatcher: AudioEventOrchestrator;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        mockRouter = {
            play: vi.fn().mockReturnValue(100),
            stop: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            applyConfigToPlayback: vi.fn(),
            getSoundConfig: vi.fn()
        } as unknown as Mocked<IAudioRouter>;

        mockRtpcAdapter = {
            getValue: vi.fn(),
            setValue: vi.fn(),
            setValues: vi.fn(),
            configureParam: vi.fn()
        } as unknown as Mocked<IRTPCAdapter>;

        mockSequencer = {
            playLoop: vi.fn(),
            stopLoop: vi.fn(),
            transitionTo: vi.fn(),
            playStinger: vi.fn(),
            destroy: vi.fn(),
            getPlaybackInfo: vi.fn()
        } as unknown as Mocked<ISequencer>;

        mockMixer = {
            activateSnapshot: vi.fn(),
            clearLayer: vi.fn(),
            events: {},
            debugLayerStack: vi.fn(),
            updateSnapshotsConfig: vi.fn()
        } as unknown as Mocked<MixerSnapshotManager>;

        mockController = {
            getCurrentTime: vi.fn().mockReturnValue(1.5),
            getPlaybackState: vi.fn().mockReturnValue('playing')
        } as unknown as Mocked<ISoundController>;

        mockPrng = {
            next: vi.fn().mockReturnValue(0.5)
        } as unknown as Mocked<IPRNG>;

        mockBankManager = {
            getBankState: vi.fn(),
            // oxlint-disable-next-line unicorn/no-useless-undefined
            loadBank: vi.fn().mockResolvedValue(undefined),
            unloadBank: vi.fn()
        };

        mockTelemetry = {
            dispatch: vi.fn()
        } as unknown as Mocked<ITelemetryDispatcher>;

        dispatcher = new AudioEventOrchestrator(
            testEventMap,
            mockRouter,
            mockRtpcAdapter,
            mockSequencer,
            mockMixer,
            mockController,
            mockPrng,
            mockBankManager,
            mockTelemetry
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should dispatch a simple play action and send ACTION_EXECUTED telemetry', () => {
        dispatcher.postEvent('Player_Jump' as EventId);

        expect(mockRouter.play).toHaveBeenCalledTimes(1);
        expect(mockRouter.play).toHaveBeenCalledWith('sfx_jump');

        expect(mockTelemetry.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'CAUSE_CHAIN',
                timestampMs: 1500,
                initiator: { type: 'EVENT', eventId: 'Player_Jump' },
                result: expect.objectContaining({
                    type: 'ACTION_EXECUTED',
                    action: expect.objectContaining({ type: 'play', target: 'sfx_jump' })
                })
            })
        );
    });

    it('should dispatch multiple actions in order (play and set_rtpc)', () => {
        dispatcher.postEvent('Enter_Water' as EventId);

        expect(mockRouter.play).toHaveBeenCalledWith('sfx_splash');
        expect(mockRtpcAdapter.setValue).toHaveBeenCalledWith('is_underwater', 1);

        const playOrder = mockRouter.play.mock.invocationCallOrder[0];
        const rtpcOrder = mockRtpcAdapter.setValue.mock.invocationCallOrder[0];
        expect(playOrder).toBeLessThan(rtpcOrder);
    });

    it('should dispatch pause and resume actions', () => {
        dispatcher.postEvent('Pause_Menu_Open' as EventId);
        expect(mockRouter.pause).toHaveBeenCalledWith('bgm_level');
        expect(mockRouter.play).toHaveBeenCalledWith('ui_menu_open');
        dispatcher.postEvent('Pause_Menu_Close' as EventId);
        expect(mockRouter.resume).toHaveBeenCalledWith('bgm_level');
    });

    it('should pass options down to the router on stop action', () => {
        dispatcher.postEvent('Boss_Defeated' as EventId);
        expect(mockRouter.stop).toHaveBeenCalledWith('bgm_boss', { allowTail: true, fadeOut: 2000 });
        expect(mockRouter.play).toHaveBeenCalledWith('jingle_victory');
    });

    it('should safely ignore and warn when posting an unknown event, and dispatch BLOCKED telemetry', () => {
        dispatcher.postEvent('Unknown_Event' as EventId);

        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Event "Unknown_Event" not found in EventMap.')
        );
        expect(mockRouter.play).not.toHaveBeenCalled();

        expect(mockTelemetry.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'CAUSE_CHAIN',
                initiator: { type: 'API', method: 'postEvent' },
                result: expect.objectContaining({
                    type: 'BLOCKED',
                    reason: expect.stringContaining('not found in EventMap')
                })
            })
        );
    });

    describe('Sequencer Integration Actions', () => {
        it('should route "start_loop" action to sequencer', () => {
            dispatcher.postEvent('Start_Combat_Music' as EventId);
            expect(mockSequencer.playLoop).toHaveBeenCalledTimes(1);
            expect(mockSequencer.playLoop).toHaveBeenCalledWith('bgm_combat', 'intro');
        });

        it('should route "stop_loop" action to sequencer', () => {
            dispatcher.postEvent('Stop_Combat_Music' as EventId);
            expect(mockSequencer.stopLoop).toHaveBeenCalledTimes(1);
            expect(mockSequencer.stopLoop).toHaveBeenCalledWith('bgm_combat');
        });

        it('should route "music_transition" action to sequencer with full options', () => {
            dispatcher.postEvent('Transition_To_Phase2' as EventId);
            expect(mockSequencer.transitionTo).toHaveBeenCalledTimes(1);
            expect(mockSequencer.transitionTo).toHaveBeenCalledWith({
                soundId: 'bgm_combat',
                targetRegion: 'phase2',
                transitionRegionName: 'fill',
                options: expect.objectContaining({
                    quantize: 'NextBar',
                    offsetMode: 'Relative'
                })
            });
        });

        it('should route "play_stinger" action to sequencer with quantize and reference track', () => {
            dispatcher.postEvent('Play_Victory_Stinger' as EventId);
            expect(mockSequencer.playStinger).toHaveBeenCalledTimes(1);
            expect(mockSequencer.playStinger).toHaveBeenCalledWith('sfx_cymbal', 'NextBeat', 'bgm_combat');
        });
    });

    describe('Mixer Facade Actions Integration', () => {
        it('should trigger mixer.setState on "set_mixer_state" action', () => {
            dispatcher.postEvent('Game_Paused' as EventId);
            expect(mockMixer.activateSnapshot).toHaveBeenCalledTimes(1);
            expect(mockMixer.activateSnapshot).toHaveBeenCalledWith('snap_pause', 'scene_main', PRIORITY.BASE);
        });

        it('should trigger mixer.addModifier on "add_mixer_modifier" action', () => {
            dispatcher.postEvent('Player_Stunned' as EventId);
            expect(mockMixer.activateSnapshot).toHaveBeenCalledTimes(1);
            expect(mockMixer.activateSnapshot).toHaveBeenCalledWith('snap_muffle', 'stun_layer', 50);
        });

        it('should trigger mixer.removeModifier on "remove_mixer_modifier" action', () => {
            dispatcher.postEvent('Player_Recovered' as EventId);
            expect(mockMixer.clearLayer).toHaveBeenCalledTimes(1);
            expect(mockMixer.clearLayer).toHaveBeenCalledWith('stun_layer');
        });
    });

    describe('Nested Actions Integration', () => {
        it('should dispatch nested events and trigger them', () => {
            const postEventSpy = vi.spyOn(AudioEventOrchestrator.prototype, 'postEvent');
            dispatcher.postEvent('Player_Nested' as EventId);
            expect(postEventSpy).toHaveBeenCalledTimes(2);
            expect(mockMixer.clearLayer).toHaveBeenCalledWith('stun_layer');
            expect(mockRouter.play).toHaveBeenCalledTimes(1);
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_jump');

            postEventSpy.mockRestore();
        });

        it('should break out of infinite recursion if depth exceeds 10 and dispatch BLOCKED telemetry', () => {
            const postEventSpy = vi.spyOn(AudioEventOrchestrator.prototype, 'postEvent');
            dispatcher.postEvent('Player_Recursion' as EventId);

            expect(postEventSpy).toHaveBeenCalledTimes(12);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Max recursion depth reached'));

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CAUSE_CHAIN',
                    initiator: { type: 'EVENT', eventId: 'Player_Recursion' },
                    result: expect.objectContaining({
                        type: 'BLOCKED',
                        reason: expect.stringContaining('Max recursion depth')
                    })
                })
            );

            postEventSpy.mockRestore();
        });
    });

    describe('Temporal Scheduling (Delays)', () => {
        it('should schedule action with delay and execute it only when time is reached', () => {
            mockController.getCurrentTime.mockReturnValue(5 as ContextTime);

            dispatcher.postEvent('Event_With_Delay' as EventId);

            expect(mockRouter.play).not.toHaveBeenCalled();
            expect((dispatcher as any).scheduledActions).toHaveLength(1);

            dispatcher.tick(6, 1000);
            expect(mockRouter.play).not.toHaveBeenCalled();

            dispatcher.tick(6.6, 600);
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_delayed');

            expect((dispatcher as any).scheduledActions).toHaveLength(0);
        });
    });

    describe('Conditions and Probabilities', () => {
        it('should skip actions if probability check fails, execute if passes, and send BLOCKED telemetry', () => {
            dispatcher.postEvent('Event_With_Probability' as EventId);

            expect(mockRouter.play).not.toHaveBeenCalledWith('sfx_unlikely');
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_likely');

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CAUSE_CHAIN',
                    result: expect.objectContaining({
                        type: 'BLOCKED',
                        reason: expect.stringContaining('Probability check failed')
                    })
                })
            );
        });

        it('should evaluate RTPC conditions dynamically, block with telemetry trace if failed', () => {
            mockRtpcAdapter.getValue.mockImplementation(param => {
                if (param === 'hp') return 80;
                return 0;
            });

            dispatcher.postEvent('Event_With_Condition' as EventId);

            expect(mockRouter.play).not.toHaveBeenCalledWith('sfx_low_hp');
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_high_hp');

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CAUSE_CHAIN',
                    result: expect.objectContaining({
                        type: 'BLOCKED',
                        reason: expect.stringContaining('Condition failed')
                    }),
                    conditionTrace: expect.objectContaining({
                        passed: false,
                        actualValue: 80,
                        threshold: 50,
                        operator: '<'
                    })
                })
            );

            mockRouter.play.mockClear();

            mockRtpcAdapter.getValue.mockImplementation(param => {
                if (param === 'hp') return 10;
                return 0;
            });

            dispatcher.postEvent('Event_With_Condition' as EventId);

            expect(mockRouter.play).toHaveBeenCalledWith('sfx_low_hp');
            expect(mockRouter.play).not.toHaveBeenCalledWith('sfx_high_hp');
        });
    });

    describe('Hysteresis in Event Conditions', () => {
        it('should maintain condition state within the hysteresis dead zone (Schmitt Trigger)', () => {
            mockRtpcAdapter.getValue.mockReturnValue(30);
            dispatcher.postEvent('Event_With_Hysteresis' as EventId);
            expect(mockRouter.play).not.toHaveBeenCalled();

            mockRtpcAdapter.getValue.mockReturnValue(22);
            dispatcher.postEvent('Event_With_Hysteresis' as EventId);
            expect(mockRouter.play).not.toHaveBeenCalled();

            mockRtpcAdapter.getValue.mockReturnValue(14);
            dispatcher.postEvent('Event_With_Hysteresis' as EventId);
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_critical_hp');
            mockRouter.play.mockClear();

            mockRtpcAdapter.getValue.mockReturnValue(22);
            dispatcher.postEvent('Event_With_Hysteresis' as EventId);
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_critical_hp');
            mockRouter.play.mockClear();

            mockRtpcAdapter.getValue.mockReturnValue(26);
            dispatcher.postEvent('Event_With_Hysteresis' as EventId);
            expect(mockRouter.play).not.toHaveBeenCalled();
        });
    });

    describe('Bank Management Actions', () => {
        it('should route "load_bank" action to bankManager without blocking execution', () => {
            dispatcher.postEvent('Load_Level_Bank' as EventId);

            expect(mockBankManager.loadBank).toHaveBeenCalledTimes(1);
            expect(mockBankManager.loadBank).toHaveBeenCalledWith('Bank_Level1');
        });

        it('should route "unload_bank" action to bankManager', () => {
            dispatcher.postEvent('Unload_Level_Bank' as EventId);

            expect(mockBankManager.unloadBank).toHaveBeenCalledTimes(1);
            expect(mockBankManager.unloadBank).toHaveBeenCalledWith('Bank_Level1');
        });
    });

    describe('Feature: Tag Tracking and Garbage Collection', () => {
        it('should correctly parse and process actions with the `tags` property', () => {
            dispatcher.postEvent('Tagged_Play' as EventId);
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_tagged');
        });

        it('should track active playbacks when an action specifies tags (strictly per 2.3)', () => {
            mockRouter.play.mockReturnValue(42);
            dispatcher.postEvent('Tagged_Play' as EventId);

            const tracked = (dispatcher as any).trackedPlaybacks;
            expect(tracked).toBeDefined();
            expect(tracked).toContainEqual({ playbackId: 42, tags: ['cutscene'] });
        });

        it('should garbage collect stopped playbacks in tick() using zero-allocation swap-and-pop', () => {
            mockRouter.play.mockReturnValueOnce(1).mockReturnValueOnce(2).mockReturnValueOnce(3);

            dispatcher.postEvent('Tagged_Play' as EventId);
            dispatcher.postEvent('Tagged_Play' as EventId);
            dispatcher.postEvent('Tagged_Play' as EventId);

            let tracked = (dispatcher as any).trackedPlaybacks;
            expect(tracked).toHaveLength(3);

            mockController.getPlaybackState.mockImplementation((id: PlaybackId) => {
                if (id === 2) return 'stopped';
                return 'playing';
            });

            dispatcher.tick(1.6, 16.6);

            tracked = (dispatcher as any).trackedPlaybacks;
            expect(tracked).toHaveLength(2);

            expect(tracked[0].playbackId).toBe(1);
            expect(tracked[1].playbackId).toBe(3);
        });
    });

    describe('Feature: cancel_pending Action', () => {
        it('should flush scheduled actions, stop active playbacks, and stop active loops by target tag', () => {
            mockController.getCurrentTime.mockReturnValue(0 as ContextTime);
            mockSequencer.getPlaybackInfo.mockReturnValueOnce({
                soundId: 'bgm_loop' as SoundId,
                state: LoopState.LOOPING,
                grid: null as unknown as IAudioGrid
            });
            mockRouter.play.mockReturnValue(99);

            dispatcher.postEvent('Tagged_Delayed' as EventId);
            dispatcher.postEvent('Tagged_Play' as EventId);
            dispatcher.postEvent('Tagged_Loop' as EventId);

            expect((dispatcher as any).scheduledActions).toHaveLength(1);

            dispatcher.postEvent('Cancel_Cutscene' as EventId);

            expect((dispatcher as any).scheduledActions).toHaveLength(0);
            expect(mockRouter.stop).toHaveBeenCalledWith(99);
            expect(mockSequencer.stopLoop).toHaveBeenCalledWith('bgm_loop');
        });

        it('should NOT cancel events that do not match the target tags', () => {
            mockController.getCurrentTime.mockReturnValue(0 as ContextTime);

            dispatcher.postEvent('Event_With_Delay' as EventId);
            expect((dispatcher as any).scheduledActions).toHaveLength(1);

            dispatcher.postEvent('Cancel_Cutscene' as EventId);

            expect((dispatcher as any).scheduledActions).toHaveLength(1);
        });
    });

    describe('Feature: Temporal Scheduling (Delayed Events)', () => {
        it('should store delayed actions in scheduledActions and NOT execute them immediately', () => {
            mockController.getCurrentTime.mockReturnValue(5.0 as ContextTime);

            dispatcher.postEvent('Event_With_Delay' as EventId);

            expect(mockRouter.play).not.toHaveBeenCalled();

            const scheduled = (dispatcher as any).scheduledActions;
            expect(scheduled).toBeDefined();
            expect(scheduled).toHaveLength(1);

            expect(scheduled[0].executeAt).toBe(6500);
        });

        it('should execute a delayed action only when the context time passes its target time', () => {
            mockController.getCurrentTime.mockReturnValue(5.0 as ContextTime);
            dispatcher.postEvent('Event_With_Delay' as EventId);

            dispatcher.tick(6.0, 1000);
            expect(mockRouter.play).not.toHaveBeenCalled();
            expect((dispatcher as any).scheduledActions).toHaveLength(1);

            dispatcher.tick(6.6, 600);
            expect(mockRouter.play).toHaveBeenCalledTimes(1);
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_delayed');

            expect((dispatcher as any).scheduledActions).toHaveLength(0);
        });

        it('should execute multiple delayed actions chronologically and maintain array stability', () => {
            mockController.getCurrentTime.mockReturnValue(10.0 as ContextTime);

            dispatcher.postEvent('Multi_Delayed' as EventId);

            expect(mockRouter.play).not.toHaveBeenCalled();
            expect((dispatcher as any).scheduledActions).toHaveLength(2);

            dispatcher.tick(10.5, 500);
            expect(mockRouter.play).not.toHaveBeenCalled();
            expect((dispatcher as any).scheduledActions).toHaveLength(2);

            dispatcher.tick(11.2, 700);
            expect(mockRouter.play).toHaveBeenCalledTimes(1);
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_seq_1');
            expect((dispatcher as any).scheduledActions).toHaveLength(1);

            dispatcher.tick(12.1, 900);
            expect(mockRouter.play).toHaveBeenCalledTimes(2);
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_seq_2');
            expect((dispatcher as any).scheduledActions).toHaveLength(0);
        });

        it('should handle large time jumps (frame drops / lags) by executing all overdue actions', () => {
            mockController.getCurrentTime.mockReturnValue(0.0 as ContextTime);

            dispatcher.postEvent('Multi_Delayed' as EventId);
            expect((dispatcher as any).scheduledActions).toHaveLength(2);

            dispatcher.tick(10.0, 10000);

            expect(mockRouter.play).toHaveBeenCalledTimes(2);
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_seq_1');
            expect(mockRouter.play).toHaveBeenCalledWith('sfx_seq_2');

            expect((dispatcher as any).scheduledActions).toHaveLength(0);
        });
    });
});
