import type { ITelemetrySnapshot, ITelemetryLifecycleEvent, ITelemetryCauseChain } from './TelemetryEvents.js';

export type TelemetryPacket = ITelemetrySnapshot | ITelemetryLifecycleEvent | ITelemetryCauseChain;

export interface ITelemetryBatch {
    readonly batchId: number;
    readonly size: number;
    readonly packets: ReadonlyArray<TelemetryPacket>;
}
