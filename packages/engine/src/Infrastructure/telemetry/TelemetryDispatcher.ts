import type { ITelemetryBatch, TelemetryPacket, ITelemetryTransport } from '@scene-grid/shared';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';

export class TelemetryDispatcher implements ITelemetryDispatcher {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public TICK_RATE_MS: number = 16;
    private readonly packets: TelemetryPacket[];
    private packetCount: number = 0;
    private batchId: number = 0;
    private readonly reusableBatch: ITelemetryBatch;

    constructor(
        private readonly transport: ITelemetryTransport | null = null,
        private readonly maxPacketsPerBatch: number = 2048
    ) {
        // oxlint-disable-next-line unicorn/no-new-array
        this.packets = new Array(maxPacketsPerBatch) as TelemetryPacket[];
        this.reusableBatch = {
            batchId: 0,
            size: 0,
            packets: this.packets
        };
    }

    public dispatch(packet: TelemetryPacket): void {
        if (!this.transport) return;

        this.packets[this.packetCount++] = packet;

        if (this.packetCount >= this.maxPacketsPerBatch) {
            this.flush();
        }
    }

    public dispatchManifest(manifestPayload: unknown): void {
        if (!this.transport) return;

        try {
            if (this.transport.sendManifest) {
                this.transport.sendManifest(manifestPayload);
            }
        } catch (error) {
            console.warn('[TelemetryDispatcher] Failed to send manifest:', error);
        }
    }

    public tick(_currentTimeSec: number, _deltaTimeMs: number): void {
        this.flush();
    }

    private flush(): void {
        if (!this.transport || this.packetCount === 0) return;

        // oxlint-disable-next-line typescript/no-explicit-any
        (this.reusableBatch as any).batchId = ++this.batchId;
        // oxlint-disable-next-line typescript/no-explicit-any
        (this.reusableBatch as any).size = this.packetCount;

        try {
            this.transport.send(this.reusableBatch);
        } catch (error) {
            console.warn('[TelemetryDispatcher] Failed to send telemetry batch:', error);
        }

        this.packetCount = 0;
    }
}
