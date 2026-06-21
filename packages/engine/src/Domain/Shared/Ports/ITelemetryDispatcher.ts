import type { TelemetryPacket } from '@scene-grid/shared';

export interface ITelemetryDispatcher {
    dispatch(packet: TelemetryPacket): void;
    dispatchManifest(manifestPayload: unknown): void;
}
