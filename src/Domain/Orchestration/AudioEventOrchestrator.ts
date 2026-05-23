import { isDefined } from '@shared/guards.js';
import type { EventAction, IEventMap, IActionCondition } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import { EventId, LayerId } from '@shared/Types/Branded.js';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import { MixerSnapshotManager, PRIORITY } from '@domain/Mixer/index.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { IPRNG } from '@shared/Math/SeededPRNG.js';

interface ScheduledAction {
    readonly action: EventAction;
    readonly executeAtMs: number;
    readonly depth: number;
}

export class AudioEventOrchestrator implements ITickable {
    private readonly scheduledActions: ScheduledAction[] = [];

    constructor(
        private readonly eventMap: IEventMap,
        private readonly router: IAudioRouter,
        private readonly rtpcAdapter: IRTPCAdapter,
        private readonly sequencer: ISequencer,
        private readonly mixer: MixerSnapshotManager,
        private readonly soundController: ISoundController,
        private readonly prng: IPRNG
    ) {}

    public postEvent(eventId: EventId, depth: number = 0): void {
        const config = this.eventMap[eventId as string];

        if (!config) {
            console.warn(`[EventDispatcher] Event "${eventId}" not found in EventMap.`);
            return;
        }

        const currentTimeMs = this.soundController.getCurrentTime() * 1000;
        const actionsLength = config.actions.length;

        for (let i = 0; i < actionsLength; i++) {
            const action = config.actions[i];

            if (isDefined(action.condition) && !this.evaluateCondition(action.condition)) {
                continue;
            }

            if (isDefined(action.probability) && this.prng.next() > action.probability) {
                continue;
            }

            if (isDefined(action.delayMs) && action.delayMs > 0) {
                this.scheduledActions.push({
                    action,
                    executeAtMs: currentTimeMs + action.delayMs,
                    depth
                });
            } else {
                this.executeAction(action, depth);
            }
        }
    }

    public tick(currentTimeSec: number, _deltaTimeMs: number): void {
        const currentTimeMs = currentTimeSec * 1000;

        const { length } = this.scheduledActions;
        for (let i = length - 1; i >= 0; i--) {
            const scheduled = this.scheduledActions[i];

            if (currentTimeMs >= scheduled.executeAtMs) {
                this.executeAction(scheduled.action, scheduled.depth);

                this.scheduledActions[i] = this.scheduledActions[length - 1];
                this.scheduledActions.pop();
            }
        }
    }

    // oxlint-disable-next-line max-lines-per-function
    private executeAction(action: EventAction, depth: number = 0): void {
        if (depth > 10 && action.type === 'trigger_event') {
            console.error(`[AudioEventOrchestrator] Max recursion depth reached for nested event: ${action.target}`);
            return;
        }

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
            case 'trigger_event':
                this.postEvent(action.target, depth + 1);
                break;
        }
    }

    private evaluateCondition(condition: IActionCondition): boolean {
        const currentValue = this.rtpcAdapter.getValue(condition.param) ?? 0;

        switch (condition.operator) {
            case '==':
                return currentValue === condition.value;
            case '!=':
                return currentValue !== condition.value;
            case '>':
                return currentValue > condition.value;
            case '>=':
                return currentValue >= condition.value;
            case '<':
                return currentValue < condition.value;
            case '<=':
                return currentValue <= condition.value;
            default:
                return false;
        }
    }
}
