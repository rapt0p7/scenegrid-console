/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AudioEventOrchestrator } from '@domain/Orchestration/AudioEventOrchestrator.js';

import type { IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { EventId, SoundId, GameParamId } from '@shared/Types/Branded.js';
import type { Mocked } from 'vitest';

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
    }
};

describe('AudioEventOrchestrator (State Machine)', () => {
    let mockRouter: Mocked<IAudioRouter>;
    let mockRtpcAdapter: Mocked<IRTPCAdapter>;
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

        dispatcher = new AudioEventOrchestrator(testEventMap, mockRouter, mockRtpcAdapter);
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
    });
});
