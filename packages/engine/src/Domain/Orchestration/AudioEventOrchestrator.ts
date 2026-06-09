// oxlint-disable max-lines-per-function
import { isDefined, CyclePool, TelemetryPacket, ConditionOperator, GameParamId } from '@scene-grid/shared';
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
    param: GameParamId;
    operator: ConditionOperator;
    threshold: number;
    actualValue: number;
    passed: boolean;
    hysteresisDeadZone?: [number, number];
}

export class AudioEventOrchestrator implements ITickable {
    private readonly scheduledActions: ScheduledAction[] = [];
    private readonly conditionStates = new WeakMap<IConditionConfig, boolean>();
    private readonly tmpConditionTrace: IConditionTrace = {
        param: '' as GameParamId,
        operator: '' as ConditionOperator,
        threshold: 0,
        actualValue: 0,
        passed: false,
        hysteresisDeadZone: undefined
    };
    private readonly telemetryPool = new CyclePool<TelemetryPacket>(256, () => ({
        type: 'CAUSE_CHAIN',
        timestampMs: 0,
        initiator: { type: 'EVENT', method: undefined, eventId: '' as EventId },
        result: { type: 'BLOCKED', reason: '', action: undefined },
        conditionTrace: undefined
    }));

    private readonly tracePool = new CyclePool<IConditionTrace>(256, () => ({
        param: '' as GameParamId,
        operator: '' as ConditionOperator,
        threshold: 0,
        actualValue: 0,
        passed: false,
        hysteresisDeadZone: undefined
    }));

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
            this.dispatchTelemetryBlocked(eventId, 'API', 'postEvent', `Event "${eventId}" not found in EventMap.`);
            return;
        }

        const currentTimeMs = this.soundController.getCurrentTime() * 1000;
        const actionsLength = config.actions.length;

        for (let i = 0; i < actionsLength; i++) {
            const action = config.actions[i];

            if (isDefined(action.condition)) {
                this.evaluateCondition(action.condition, this.tmpConditionTrace);
                if (!this.tmpConditionTrace.passed) {
                    this.dispatchTelemetryBlocked(
                        eventId,
                        'EVENT',
                        undefined,
                        `Condition failed for action type: ${action.type}`,
                        this.tmpConditionTrace
                    );
                    continue;
                }
            }

            if (isDefined(action.probability) && this.prng.next() > action.probability) {
                this.dispatchTelemetryBlocked(
                    eventId,
                    'EVENT',
                    undefined,
                    `Probability check failed for action type: ${action.type}`
                );
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
            this.dispatchTelemetryBlocked(
                eventId,
                'EVENT',
                undefined,
                `Max recursion depth reached for nested event: ${action.target}`
            );
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

        this.dispatchTelemetrySuccess(eventId, action);
    }

    private evaluateCondition(condition: DeepReadonly<IConditionConfig>, outTrace: IConditionTrace): void {
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

        outTrace.param = condition.param;
        outTrace.operator = condition.operator;
        outTrace.threshold = condition.value;
        outTrace.actualValue = currentValue;
        outTrace.passed = isMet;
        outTrace.hysteresisDeadZone = condition.hysteresis
            ? [condition.value - condition.hysteresis, condition.value + condition.hysteresis]
            : undefined;
    }

    private dispatchTelemetryBlocked(
        eventId: EventId,
        initType: 'API' | 'EVENT',
        initMethod: string | undefined,
        reason: string,
        trace?: IConditionTrace
    ): void {
        if (!this.telemetry) return;

        const log = this.telemetryPool.getNext() as any;

        log.timestampMs = this.soundController.getCurrentTime() * 1000;
        log.initiator.type = initType;
        log.initiator.eventId = initType === 'EVENT' ? eventId : undefined;
        log.initiator.method = initMethod;
        log.result.type = 'BLOCKED';
        log.result.reason = reason;
        log.result.action = undefined;

        if (trace) {
            const pooledTrace = this.tracePool.getNext();

            pooledTrace.param = trace.param;
            pooledTrace.operator = trace.operator;
            pooledTrace.threshold = trace.threshold;
            pooledTrace.actualValue = trace.actualValue;
            pooledTrace.passed = trace.passed;
            pooledTrace.hysteresisDeadZone = trace.hysteresisDeadZone;

            log.conditionTrace = pooledTrace;
        } else {
            log.conditionTrace = undefined;
        }

        this.telemetry.dispatch(log);
    }

    private dispatchTelemetrySuccess(eventId: EventId, action: EventAction): void {
        if (!this.telemetry) return;

        const log = this.telemetryPool.getNext() as any;

        log.timestampMs = this.soundController.getCurrentTime() * 1000;
        log.initiator.type = 'EVENT';
        log.initiator.eventId = eventId;
        log.initiator.method = undefined;
        log.result.type = 'ACTION_EXECUTED';
        log.result.reason = undefined;
        log.result.action = action;
        log.conditionTrace = undefined;

        this.telemetry.dispatch(log);
    }
}
