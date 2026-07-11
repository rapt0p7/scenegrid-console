import type { ITelemetryBatch, ITelemetryTransport } from '@scene-grid/shared';
import { BroadcastIpcAdapter } from './BroadcastIpcAdapter.js';

export class BroadcastTelemetryTransport implements ITelemetryTransport {
    private transport = new BroadcastIpcAdapter<ITelemetryBatch | { type: 'MANIFEST'; payload: unknown }>(
        'scenegrid_audio_telemetry'
    );

    public send(batch: ITelemetryBatch): void {
        this.transport.send(batch);
    }

    public sendManifest(manifestPayload: unknown): void {
        this.transport.send({ type: 'MANIFEST', payload: manifestPayload });
    }

    public dispose(): void {
        this.transport.dispose();
    }
}
