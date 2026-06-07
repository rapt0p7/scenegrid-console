// oxlint-disable max-lines-per-function
import { isDefined } from '@scene-grid/shared';
import type { EventAction, IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { EventId, LayerId, IPRNG, DeepReadonly, IConditionConfig } from '@scene-grid/shared';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import { MixerSnapshotManager, PRIORITY } from '@domain/Mixer/index.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { IBankManager } from '@domain/Shared/Ports/IBankManager.js';
import { ConditionEvaluator } from '@domain/Shared/Evaluators/ConditionEvaluator.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';

interface ScheduledAction {
    readonly eventId: EventId;
    readonly action: EventAction;
    readonly executeAtMs: number;
    readonly depth: number;
}

interface IConditionTrace {
    readonly param: string;
    readonly operator: string;
    readonly threshold: number;
    readonly actualValue: number;
    readonly passed: boolean;
    readonly hysteresisDeadZone?: [number, number];
}

export class AudioEventOrchestrator implements ITickable {
    private readonly scheduledActions: ScheduledAction[] = [];
    private readonly conditionStates = new WeakMap<IConditionConfig, boolean>();

    constructor(
        private readonly eventMap: IEventMap,
        private readonly router: IAudioRouter,
        private readonly rtpcAdapter: IRTPCAdapter,
        private readonly sequencer: ISequencer,
        private readonly mixer: MixerSnapshotManager,
        private readonly soundController: ISoundController,
        private readonly prng: IPRNG,
        private readonly bankManager: IBankManager,
        private readonly telemetry?: ITelemetryDispatcher
    ) {}

    public postEvent(eventId: EventId, depth: number = 0): void {
        const config = this.eventMap[eventId as string];

        if (!config) {
            console.warn(`[EventDispatcher] Event "${eventId}" not found in EventMap.`);
            this.telemetry?.dispatch({
                type: 'CAUSE_CHAIN',
                timestampMs: performance.now(),
                initiator: { type: 'API', method: 'postEvent' },
                result: { type: 'BLOCKED', reason: `Event "${eventId}" not found in EventMap.` }
            });
            return;
        }

        const currentTimeMs = this.soundController.getCurrentTime() * 1000;
        const actionsLength = config.actions.length;

        for (let i = 0; i < actionsLength; i++) {
            const action = config.actions[i];

            if (isDefined(action.condition)) {
                const trace = this.evaluateCondition(action.condition);
                if (!trace.passed) {
                    this.telemetry?.dispatch({
                        type: 'CAUSE_CHAIN',
                        timestampMs: performance.now(),
                        initiator: { type: 'EVENT', eventId },
                        result: { type: 'BLOCKED', reason: `Condition failed for action type: ${action.type}` },
                        conditionTrace: trace as any
                    });
                    continue;
                }
            }

            if (isDefined(action.probability) && this.prng.next() > action.probability) {
                this.telemetry?.dispatch({
                    type: 'CAUSE_CHAIN',
                    timestampMs: performance.now(),
                    initiator: { type: 'EVENT', eventId },
                    result: { type: 'BLOCKED', reason: `Probability check failed for action type: ${action.type}` }
                });
                continue;
            }

            if (isDefined(action.delayMs) && action.delayMs > 0) {
                this.scheduledActions.push({
                    eventId,
                    action,
                    executeAtMs: currentTimeMs + action.delayMs,
                    depth
                });
            } else {
                this.executeAction(eventId, action, depth);
            }
        }
    }

    public tick(currentTimeSec: number, _deltaTimeMs: number): void {
        const currentTimeMs = currentTimeSec * 1000;

        const { length } = this.scheduledActions;
        for (let i = length - 1; i >= 0; i--) {
            const scheduled = this.scheduledActions[i];

            if (currentTimeMs >= scheduled.executeAtMs) {
                this.executeAction(scheduled.eventId, scheduled.action, scheduled.depth);

                this.scheduledActions[i] = this.scheduledActions[length - 1];
                this.scheduledActions.pop();
            }
        }
    }

    private executeAction(eventId: EventId, action: EventAction, depth: number = 0): void {
        if (depth > 10 && action.type === 'trigger_event') {
            console.error(`[AudioEventOrchestrator] Max recursion depth reached for nested event: ${action.target}`);
            this.telemetry?.dispatch({
                type: 'CAUSE_CHAIN',
                timestampMs: performance.now(),
                initiator: { type: 'EVENT', eventId },
                result: { type: 'BLOCKED', reason: `Max recursion depth reached for nested event: ${action.target}` }
            });
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
            case 'load_bank':
                this.bankManager.loadBank(action.target).catch(console.error);
                break;
            case 'unload_bank':
                this.bankManager.unloadBank(action.target);
                break;
            case 'trigger_event':
                this.postEvent(action.target, depth + 1);
                break;
        }

        this.dispatchSuccess(eventId, { type: 'ACTION_EXECUTED', action });
    }

    private evaluateCondition(condition: DeepReadonly<IConditionConfig>): IConditionTrace {
        const currentValue = this.rtpcAdapter.getValue(condition.param) ?? 0;

        const conditionKey = condition as unknown as IConditionConfig;

        const previouslyMet = this.conditionStates.get(conditionKey) ?? false;

        const isMet = ConditionEvaluator.evaluate(
            currentValue,
            condition.operator,
            condition.value,
            condition.hysteresis,
            previouslyMet
        );

        this.conditionStates.set(conditionKey, isMet);

        return {
            param: condition.param,
            operator: condition.operator,
            threshold: condition.value,
            actualValue: currentValue,
            passed: isMet,
            hysteresisDeadZone: condition.hysteresis
                ? [condition.value - condition.hysteresis, condition.value + condition.hysteresis]
                : undefined
        };
    }

    private dispatchSuccess(eventId: EventId, result: any): void {
        this.telemetry?.dispatch({
            type: 'CAUSE_CHAIN',
            timestampMs: performance.now(),
            initiator: { type: 'EVENT', eventId },
            result
        });
    }
}
