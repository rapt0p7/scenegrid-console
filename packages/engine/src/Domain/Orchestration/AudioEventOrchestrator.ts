// oxlint-disable max-lines-per-function

import type { EventAction, IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISequencer } from '@domain/Orchestration/Ports/ISequencer.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IBankManager } from '@domain/Shared/Ports/IBankManager.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { EventId, LayerId, IPRNG, DeepReadonly, IConditionConfig } from '@scene-grid/shared';

import { MixerSnapshotManager, PRIORITY } from '@domain/Mixer/index.js';
import { AudioEventTelemetryLogger, MutableConditionTrace } from '@domain/Orchestration/AudioEventTelemetryLogger.js';
import { ConditionEvaluator } from '@domain/Shared/Evaluators/ConditionEvaluator.js';
import {
    isDefined,
    ConditionOperator,
    GameParamId,
    Milliseconds,
    TimeMath,
    PlaybackId,
    SoundId
} from '@scene-grid/shared';

interface ScheduledAction {
    readonly eventId: EventId;
    readonly action: EventAction;
    readonly executeAt: Milliseconds;
    readonly depth: number;
}

interface TrackedPlayback {
    playbackId: PlaybackId | SoundId;
    readonly tags: readonly string[];
}

export class AudioEventOrchestrator implements ITickable {
    public readonly TICK_DIVIDER: number = 1;
    private readonly scheduledActions: ScheduledAction[] = [];
    private readonly trackedPlaybacks: TrackedPlayback[] = [];
    private readonly conditionStates = new WeakMap<IConditionConfig, boolean>();
    private readonly telemetryLogger: AudioEventTelemetryLogger;

    private readonly tmpConditionTrace: MutableConditionTrace = {
        param: '' as GameParamId,
        operator: '' as ConditionOperator,
        threshold: 0,
        actualValue: 0,
        passed: false,
        hysteresisDeadZone: undefined
    };

    constructor(
        private readonly eventMap: IEventMap,
        private readonly router: IAudioRouter,
        private readonly rtpcAdapter: IRTPCAdapter,
        private readonly sequencer: ISequencer,
        private readonly mixer: MixerSnapshotManager,
        private readonly soundController: ISoundController,
        private readonly prng: IPRNG,
        private readonly bankManager: IBankManager,
        telemetry?: ITelemetryDispatcher
    ) {
        this.telemetryLogger = new AudioEventTelemetryLogger(telemetry, soundController);
    }

    public postEvent(eventId: EventId, depth: number = 0): void {
        const config = this.eventMap[eventId as string];

        if (!config) {
            console.warn(`[EventDispatcher] Event "${eventId}" not found in EventMap.`);
            this.telemetryLogger.dispatchBlocked(
                eventId,
                'API',
                'postEvent',
                `Event "${eventId}" not found in EventMap.`
            );
            return;
        }

        const currentTimeMs = TimeMath.secondsToMilliseconds(
            TimeMath.castToSeconds(this.soundController.getCurrentTime())
        );
        const actionsLength = config.actions.length;

        for (let i = 0; i < actionsLength; i++) {
            const action = config.actions[i];

            if (!this.shouldExecuteAction(action, eventId)) {
                continue;
            }

            if (isDefined(action.delay) && action.delay > 0) {
                this.scheduledActions.push({
                    eventId,
                    action,
                    executeAt: (currentTimeMs + action.delay) as Milliseconds,
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

            if (currentTimeMs >= scheduled.executeAt) {
                this.executeAction(scheduled.eventId, scheduled.action, scheduled.depth);

                this.scheduledActions[i] = this.scheduledActions[length - 1];
                this.scheduledActions.pop();
            }
        }

        const trackedLength = this.trackedPlaybacks.length;
        for (let i = trackedLength - 1; i >= 0; i--) {
            const tracked = this.trackedPlaybacks[i];
            if (this.isTrackedPlaybackStopped(tracked)) {
                this.trackedPlaybacks[i] = this.trackedPlaybacks[this.trackedPlaybacks.length - 1];
                this.trackedPlaybacks.pop();
            }
        }
    }

    private shouldExecuteAction(action: EventAction, eventId: EventId): boolean {
        if (isDefined(action.condition)) {
            this.evaluateCondition(action.condition, this.tmpConditionTrace);
            if (!this.tmpConditionTrace.passed) {
                this.telemetryLogger.dispatchBlocked(
                    eventId,
                    'EVENT',
                    undefined,
                    `Condition failed for action type: ${action.type}`,
                    this.tmpConditionTrace
                );
                return false;
            }
        }

        if (isDefined(action.probability) && this.prng.next() > action.probability) {
            this.telemetryLogger.dispatchBlocked(
                eventId,
                'EVENT',
                undefined,
                `Probability check failed for action type: ${action.type}`
            );
            return false;
        }

        return true;
    }

    private isTrackedPlaybackStopped(tracked: TrackedPlayback): boolean {
        if (typeof tracked.playbackId === 'number') {
            return this.soundController.getPlaybackState(tracked.playbackId) === 'stopped';
        }
        return this.sequencer.getPlaybackInfo(tracked.playbackId)?.soundId === tracked.playbackId;
    }

    private handlePlayAction(action: Extract<EventAction, { type: 'play' }>): void {
        const playbackId = this.router.play(action.target);
        if (isDefined(playbackId) && action.tags) {
            if (Array.isArray(playbackId)) {
                const length = playbackId.length;
                for (let i = 0; i < length; i++) {
                    this.trackedPlaybacks.push({ playbackId: playbackId[i] as PlaybackId, tags: action.tags });
                }
            } else {
                this.trackedPlaybacks.push({ playbackId: playbackId as PlaybackId, tags: action.tags });
            }
        }
    }

    private handleCancelPendingAction(action: Extract<EventAction, { type: 'cancel_pending' }>): void {
        const targetTags = action.targetTags;
        for (let i = this.scheduledActions.length - 1; i >= 0; i--) {
            const scheduled = this.scheduledActions[i];
            if (scheduled.action.tags?.some(t => targetTags.includes(t))) {
                this.scheduledActions[i] = this.scheduledActions[this.scheduledActions.length - 1];
                this.scheduledActions.pop();
            }
        }
        for (let i = this.trackedPlaybacks.length - 1; i >= 0; i--) {
            const tracked = this.trackedPlaybacks[i];
            if (tracked.tags.some(t => targetTags.includes(t))) {
                if (typeof tracked.playbackId === 'string') {
                    this.sequencer.stopLoop(tracked.playbackId);
                }
                this.router.stop(tracked.playbackId);

                this.trackedPlaybacks[i] = this.trackedPlaybacks[this.trackedPlaybacks.length - 1];
                this.trackedPlaybacks.pop();
            }
        }
    }

    private executeAction(eventId: EventId, action: EventAction, depth: number = 0): void {
        if (depth > 10 && action.type === 'trigger_event') {
            console.error(`[AudioEventOrchestrator] Max recursion depth reached for nested event: ${action.target}`);
            this.telemetryLogger.dispatchBlocked(
                eventId,
                'EVENT',
                undefined,
                `Max recursion depth reached for nested event: ${action.target}`
            );
            return;
        }

        switch (action.type) {
            case 'play':
                this.handlePlayAction(action);
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
                if (action.tags) {
                    this.trackedPlaybacks.push({ playbackId: action.target, tags: action.tags });
                }
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
            case 'cancel_pending':
                this.handleCancelPendingAction(action);
                break;
        }

        this.telemetryLogger.dispatchSuccess(eventId, action);
    }

    private evaluateCondition(condition: DeepReadonly<IConditionConfig>, outTrace: MutableConditionTrace): void {
        const currentValue = this.rtpcAdapter.getValue(condition.param) ?? 0;

        const conditionKey = condition;

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
}
