import type { ITelemetryBatch, ITelemetryTransport } from '@scene-grid/shared';

export class BroadcastTelemetryTransport implements ITelemetryTransport {
    private readonly channel: BroadcastChannel;

    constructor(channelName: string = 'scenegrid_audio_telemetry') {
        this.channel = new BroadcastChannel(channelName);
    }

    public send(batch: ITelemetryBatch): void {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        this.channel.postMessage(batch);
    }

    public sendManifest(manifestPayload: unknown): void {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        this.channel.postMessage({ type: 'MANIFEST', payload: manifestPayload });
    }

    public dispose(): void {
        this.channel.close();
    }
}
