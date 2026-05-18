/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AudioEventOrchestrator } from '@domain/Orchestration/AudioEventOrchestrator.js';

import type { IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type { EventId, SoundId, GameParamId, RegionId, SnapshotId, LayerId } from '@shared/Types/Branded.js';
import type { Mocked } from 'vitest';
import { MixerSnapshotManager, PRIORITY } from '@domain/Mixer/index.js';

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
            { type: 'stop', target: 'bgm_boss' as SoundId, options: { allowTail: true, fadeOutMs: 2000 } },
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
    }
};

describe('AudioEventOrchestrator (State Machine)', () => {
    let mockRouter: Mocked<IAudioRouter>;
    let mockRtpcAdapter: Mocked<IRTPCAdapter>;
    let mockSequencer: Mocked<ISequencer>;
    let mockMixer: Mocked<MixerSnapshotManager>;
    let dispatcher: AudioEventOrchestrator;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockRouter = {
            play: vi.fn(),
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
            destroy: vi.fn()
        } as unknown as Mocked<ISequencer>;

        mockMixer = {
            activateSnapshot: vi.fn(),
            clearLayer: vi.fn(),
            events: {},
            debugLayerStack: vi.fn(),
            updateSnapshotsConfig: vi.fn()
        } as unknown as Mocked<MixerSnapshotManager>;

        dispatcher = new AudioEventOrchestrator(testEventMap, mockRouter, mockRtpcAdapter, mockSequencer, mockMixer);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should dispatch a simple play action', () => {
        dispatcher.postEvent('Player_Jump' as EventId);
        expect(mockRouter.play).toHaveBeenCalledTimes(1);
        expect(mockRouter.play).toHaveBeenCalledWith('sfx_jump');
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
    });

    it('should pass options down to the router on stop action', () => {
        dispatcher.postEvent('Boss_Defeated' as EventId);
        expect(mockRouter.stop).toHaveBeenCalledWith('bgm_boss', { allowTail: true, fadeOutMs: 2000 });
        expect(mockRouter.play).toHaveBeenCalledWith('jingle_victory');
    });

    it('should safely ignore and warn when posting an unknown event', () => {
        dispatcher.postEvent('Unknown_Event' as EventId);

        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Event "Unknown_Event" not found in EventMap.')
        );
        expect(mockRouter.play).not.toHaveBeenCalled();
        expect(mockRtpcAdapter.setValue).not.toHaveBeenCalled();
        expect(mockSequencer.playLoop).not.toHaveBeenCalled();
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
});
