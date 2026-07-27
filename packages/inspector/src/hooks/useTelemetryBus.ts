// oxlint-disable max-lines-per-function
// noinspection D

import { useEffect, useRef, useState } from 'react';
import type {
    ITelemetryBatch,
    ITelemetrySnapshot,
    ITelemetryLifecycleEvent,
    ITelemetryCauseChain,
    ITelemetryConsistencyReport,
    ITelemetryRamReport
} from '@scene-grid/shared';
import type { IEngineManifestDTO } from '../types/ManifestDTO';

const MAX_LOG_LINES = 200;

// eslint-disable-next-line @typescript-eslint/naming-convention
export type UILogPacket = (ITelemetryLifecycleEvent | ITelemetryCauseChain) & { _seq: number };

// oxlint-disable-next-line max-lines-per-function
export function useTelemetryBus(channelName: string = 'scenegrid_audio_telemetry') {
    const [logs, setLogs] = useState<UILogPacket[]>([]);
    const [manifest, setManifest] = useState<IEngineManifestDTO | null>(null);
    const [consistencyReport, setConsistencyReport] = useState<ITelemetryConsistencyReport | null>(null);
    const [ramReport, setRamReport] = useState<ITelemetryRamReport | null>(null);
    const latestSnapshot = useRef<ITelemetrySnapshot | null>(null);
    const sequenceRef = useRef(0);

    useEffect(() => {
        const channel = new BroadcastChannel(channelName);

        // oxlint-disable-next-line unicorn/prefer-add-event-listener
        channel.onmessage = (
            event: MessageEvent<ITelemetryBatch | { type: 'MANIFEST'; payload: IEngineManifestDTO }>
        ) => {
            const data = event.data;
            const newLogs: UILogPacket[] = [];

            if ('type' in data && data.type === 'MANIFEST') {
                setManifest(data.payload);
                return;
            }

            const batch = data as ITelemetryBatch;

            for (let i = 0; i < batch.size; i++) {
                const packet = batch.packets[i];

                if (packet.type === 'SNAPSHOT') {
                    latestSnapshot.current = packet;
                } else if (packet.type === 'LIFECYCLE' || packet.type === 'CAUSE_CHAIN') {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    newLogs.push({ ...packet, _seq: sequenceRef.current++ });
                } else if (packet?.type === 'CONSISTENCY_REPORT') {
                    setConsistencyReport(packet);
                } else if (packet?.type === 'RAM_REPORT') {
                    setRamReport(packet);
                }
            }

            if (newLogs.length > 0) {
                setLogs(prevLogs => {
                    const combined = [...newLogs, ...prevLogs];
                    combined.sort((a, b) => {
                        const timeDiff = b.timestampMs - a.timestampMs;

                        if (timeDiff !== 0) return timeDiff;

                        // oxlint-disable-next-line no-underscore-dangle
                        return b._seq - a._seq;
                    });
                    if (combined.length > MAX_LOG_LINES) {
                        combined.length = MAX_LOG_LINES;
                    }
                    return combined;
                });
            }
        };

        return () => {
            channel.close();
        };
    }, [channelName]);

    return { logs, latestSnapshot, manifest, consistencyReport, ramReport };
}
