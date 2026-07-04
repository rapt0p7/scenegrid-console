import type {
    ITelemetrySnapshot,
    ITelemetryLifecycleEvent,
    ITelemetryCauseChain,
    ITelemetryConsistencyReport
} from './TelemetryEvents.js';

export type TelemetryPacket =
    | ITelemetrySnapshot
    | ITelemetryLifecycleEvent
    | ITelemetryCauseChain
    | ITelemetryConsistencyReport;

export interface ITelemetryBatch {
    readonly batchId: number;
    readonly size: number;
    readonly packets: ReadonlyArray<TelemetryPacket>;
}
