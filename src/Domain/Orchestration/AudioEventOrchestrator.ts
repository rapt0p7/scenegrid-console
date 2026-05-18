import type { EventAction, IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import { EventId, LayerId } from '@shared/Types/Branded.js';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import { MixerSnapshotManager, PRIORITY } from '@domain/Mixer/index.js';

export class AudioEventOrchestrator {
    constructor(
        private readonly eventMap: IEventMap,
        private readonly router: IAudioRouter,
        private readonly rtpcAdapter: IRTPCAdapter,
        private readonly sequencer: ISequencer,
        private readonly mixer: MixerSnapshotManager
    ) {}

    public postEvent(eventId: EventId): void {
        const config = this.eventMap[eventId as string];

        if (!config) {
            console.warn(`[EventDispatcher] Event "${eventId}" not found in EventMap.`);
            return;
        }

        const actionsLength = config.actions.length;
        for (let i = 0; i < actionsLength; i++) {
            this.executeAction(config.actions[i]);
        }
    }

    // oxlint-disable-next-line max-lines-per-function
    private executeAction(action: EventAction): void {
        switch (action.type) {
            case 'play':
                this.router.play(action.target);
                break;
            case 'stop':
                this.router.stop(action.target, action.options);
                break;
            case 'pause':
                this.router.pause(action.target);
                break;
            case 'resume':
                this.router.resume(action.target);
                break;
            case 'set_rtpc':
                this.rtpcAdapter.setValue(action.param, action.value);
                break;
            case 'start_loop':
                this.sequencer.playLoop(action.target, action.startRegion);
                break;
            case 'stop_loop':
                this.sequencer.stopLoop(action.target);
                break;
            case 'music_transition':
                this.sequencer.transitionTo({
                    soundId: action.target,
                    targetRegion: action.targetRegion,
                    transitionRegionName: action.transitionRegionName,
                    options: action.options
                });
                break;
            case 'play_stinger':
                this.sequencer.playStinger(action.target, action.quantize, action.referenceTrackId);
                break;
            case 'set_mixer_state':
                this.mixer.activateSnapshot(action.snapshotName, 'scene_main' as LayerId, PRIORITY.BASE);
                break;

            case 'add_mixer_modifier':
                this.mixer.activateSnapshot(
                    action.snapshotName,
                    action.modifierId,
                    action.priority ?? PRIORITY.OVERLAY
                );
                break;

            case 'remove_mixer_modifier':
                this.mixer.clearLayer(action.modifierId);
                break;
        }
    }
}
