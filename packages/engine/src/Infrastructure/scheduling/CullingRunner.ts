import type { ICullingArbiter, ICullingContext } from '@domain/Culling/Ports/ICullingArbiter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { Milliseconds } from '@scene-grid/shared';

export class CullingRunner {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static TICK_RATE: Milliseconds = 500 as Milliseconds;
    constructor(
        private readonly arbiter: ICullingArbiter,
        private readonly controller: ISoundController,
        private readonly contextProvider: ICullingContext,
        private readonly telemetry?: ITelemetryDispatcher
    ) {}

    public tick(audioCurrentTime: number, deltaTime: Milliseconds): void {
        const decisions = this.arbiter.evaluate(this.contextProvider, deltaTime);
        const audioTimeMs = this.controller.getCurrentTime() * 1000;

        for (let i = 0; i < decisions.virtualizeCount; i++) {
            const decision = decisions.toVirtualize[i];

            this.telemetry?.dispatch({
                type: 'CAUSE_CHAIN',
                timestampMs: audioTimeMs,
                initiator: { type: 'CULLING_ARBITER', reason: decision.reason },
                result: { type: 'VIRTUALIZE', target: decision.playbackId }
            });

            this.controller.virtualize(decision.playbackId, decision.reason);
        }

        for (let i = 0; i < decisions.devirtualizeCount; i++) {
            this.controller.devirtualize(decisions.toDevirtualize[i]);
        }
    }
}
