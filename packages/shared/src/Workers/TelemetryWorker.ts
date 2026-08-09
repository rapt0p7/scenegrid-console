/* eslint-disable @typescript-eslint/naming-convention */
// oxlint-disable max-lines-per-function
/// <reference lib="webworker" />
// noinspection D

declare const self: SharedWorkerGlobalScope;

import type { ITelemetryBatch } from '../Telemetry/TelemetryBatch.js';
import type { ITelemetrySnapshot } from '../Telemetry/TelemetryEvents.js';

const MAX_LOGS = 200;

const connectedPorts = new Set<MessagePort>();

let bufferedManifest: { type: 'MANIFEST'; payload: unknown } | null = null;
let bufferedValidationReport: any = null;
let bufferedRamReport: any = null;
let latestSnapshot: ITelemetrySnapshot | null = null;
let bufferedLogs: any[] = [];

// oxlint-disable-next-line unicorn/prefer-add-event-listener
self.onconnect = (event: MessageEvent) => {
    const port = event.ports[0];
    connectedPorts.add(port);

    if (bufferedManifest) {
        port.postMessage(bufferedManifest);
    }

    const replayPackets: any[] = [];

    if (bufferedValidationReport) replayPackets.push(bufferedValidationReport);
    if (bufferedRamReport) replayPackets.push(bufferedRamReport);
    if (latestSnapshot) replayPackets.push(latestSnapshot);
    if (bufferedLogs.length > 0) replayPackets.push(...bufferedLogs);

    if (replayPackets.length > 0) {
        const replayBatch: ITelemetryBatch = {
            batchId: -1,
            size: replayPackets.length,
            packets: replayPackets
        };
        port.postMessage(replayBatch);
    }

    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    port.onmessage = (msgEvent: MessageEvent) => {
        const data = msgEvent.data;

        if (data && typeof data === 'object') {
            if (data.type === 'MANIFEST') {
                bufferedManifest = data;
                bufferedValidationReport = null;
                bufferedRamReport = null;
                latestSnapshot = null;
                bufferedLogs = [];
            } else if (data.size !== undefined && Array.isArray(data.packets)) {
                for (let i = 0; i < data.size; i++) {
                    const packet = data.packets[i];

                    if (packet.type === 'SNAPSHOT') {
                        latestSnapshot = packet;
                    } else if (packet.type === 'VALIDATION_REPORT' || packet.type === 'CONSISTENCY_REPORT') {
                        bufferedValidationReport = packet;
                    } else if (packet.type === 'RAM_REPORT') {
                        bufferedRamReport = packet;
                    } else if (packet.type === 'LIFECYCLE' || packet.type === 'CAUSE_CHAIN') {
                        bufferedLogs.push(packet);
                        // oxlint-disable-next-line max-depth
                        if (bufferedLogs.length > MAX_LOGS) {
                            bufferedLogs.shift();
                        }
                    }
                }
            }
        }

        for (const clientPort of connectedPorts) {
            if (clientPort !== port) {
                // oxlint-disable-next-line unicorn/require-post-message-target-origin
                clientPort.postMessage(data);
            }
        }
    };

    // oxlint-disable-next-line unicorn/prefer-add-event-listener
    port.onmessageerror = () => {
        connectedPorts.delete(port);
    };

    port.start();
};
