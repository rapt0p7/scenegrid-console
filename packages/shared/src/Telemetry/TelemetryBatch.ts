import {
    ITelemetrySnapshot,
    ITelemetryLifecycleEvent,
    ITelemetryCauseChain,
    ITelemetryConsistencyReport,
    ITelemetryRamReport
} from './TelemetryEvents.js';

export type TelemetryPacket =
    | ITelemetrySnapshot
    | ITelemetryLifecycleEvent
    | ITelemetryCauseChain
    | ITelemetryConsistencyReport
    | ITelemetryRamReport;

export interface ITelemetryBatch {
    readonly batchId: number;
    readonly size: number;
    readonly packets: ReadonlyArray<TelemetryPacket>;
}
