import type { ITelemetryBatch } from './TelemetryBatch.js';

export interface ITelemetryTransport {
    send(batch: ITelemetryBatch): void;
}
