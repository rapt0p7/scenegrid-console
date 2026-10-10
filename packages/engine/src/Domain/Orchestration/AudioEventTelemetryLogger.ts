import type { EventAction } from '@domain/Configuration/Ports/IEventConfig.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { EventId } from '@scene-grid/shared';
import type { IConditionTrace } from '@scene-grid/shared';

import { CyclePool, TelemetryPacket, ConditionOperator, GameParamId } from '@scene-grid/shared';

export type MutableConditionTrace = {
    -readonly [K in keyof IConditionTrace]: IConditionTrace[K];
};

export class AudioEventTelemetryLogger {
    private readonly telemetryPool = new CyclePool<TelemetryPacket>(256, () => ({
        type: 'CAUSE_CHAIN',
        timestampMs: 0,
        initiator: { type: 'EVENT', method: undefined, eventId: '' as EventId },
        result: { type: 'BLOCKED', reason: '', action: undefined },
        conditionTrace: undefined
    }));

    private readonly tracePool = new CyclePool<MutableConditionTrace>(256, () => ({
        param: '' as GameParamId,
        operator: '' as ConditionOperator,
        threshold: 0,
        actualValue: 0,
        passed: false,
        hysteresisDeadZone: undefined
    }));

    constructor(
        private readonly telemetry: ITelemetryDispatcher | undefined,
        private readonly soundController: ISoundController
    ) {}

    public dispatchBlocked(
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

    public dispatchSuccess(eventId: EventId, action: EventAction): void {
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
