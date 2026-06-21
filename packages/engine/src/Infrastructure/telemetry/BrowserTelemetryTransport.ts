import type { ITelemetryBatch, ITelemetryTransport } from '@scene-grid/shared';

export class BrowserTelemetryTransport implements ITelemetryTransport {
    private targetWindow: Window | null = null;
    private readonly channelId: string;

    constructor(channelId: string = 'audio-engine-telemetry') {
        this.channelId = channelId;
    }

    public connect(inspectorWindow: Window): void {
        this.targetWindow = inspectorWindow;
    }

    public send(batch: ITelemetryBatch): void {
        if (!this.targetWindow) return;

        this.targetWindow.postMessage({ channel: this.channelId, payload: batch.packets.slice(0, batch.size) }, '*');
    }

    public sendManifest(manifestPayload: unknown): void {
        if (!this.targetWindow) return;

        this.targetWindow.postMessage({ channel: this.channelId, type: 'MANIFEST', payload: manifestPayload }, '*');
    }
}
