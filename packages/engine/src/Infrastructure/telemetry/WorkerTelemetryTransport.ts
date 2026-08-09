import type { ITelemetryBatch, ITelemetryTransport } from '@scene-grid/shared';

export class WorkerTelemetryTransport implements ITelemetryTransport {
    constructor(private readonly port: MessagePort) {
        this.port.start();
    }

    public send(batch: ITelemetryBatch): void {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        this.port.postMessage(batch);
    }

    public sendManifest(manifestPayload: unknown): void {
        this.port.postMessage({
            type: 'MANIFEST',
            payload: manifestPayload
            // oxlint-disable-next-line unicorn/require-post-message-target-origin
        });
    }
}
