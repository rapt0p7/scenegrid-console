// oxlint-disable max-lines-per-function
// noinspection D

import type {
    ITelemetryBatch,
    ITelemetrySnapshot,
    ITelemetryLifecycleEvent,
    ITelemetryCauseChain,
    ITelemetryConsistencyReport,
    ITelemetryRamReport
} from '@scene-grid/shared';

import { createTelemetryWorker } from '@scene-grid/shared';
import { useEffect, useRef, useState } from 'react';

import type { IEngineManifestDTO } from '../types/ManifestDTO';

const MAX_LOG_LINES = 200;

// eslint-disable-next-line @typescript-eslint/naming-convention
export type UILogPacket = (ITelemetryLifecycleEvent | ITelemetryCauseChain) & { _seq: number };

export function useTelemetryBus() {
    const [logs, setLogs] = useState<UILogPacket[]>([]);
    const [manifest, setManifest] = useState<IEngineManifestDTO | null>(null);
    const [consistencyReport, setConsistencyReport] = useState<ITelemetryConsistencyReport | null>(null);
    const [ramReport, setRamReport] = useState<ITelemetryRamReport | null>(null);
    const latestSnapshot = useRef<ITelemetrySnapshot | null>(null);
    const sequenceRef = useRef(0);

    useEffect(() => {
        const worker = createTelemetryWorker({ name: 'SceneGridTelemetry' });
        const port = worker.port;

        const handleMessage = (
            event: MessageEvent<ITelemetryBatch | { type: 'MANIFEST'; payload: IEngineManifestDTO }>
        ) => {
            const data = event.data;
            const newLogs: UILogPacket[] = [];

            if ('type' in data && data.type === 'MANIFEST') {
                setManifest(data.payload);
                setLogs([]);
                setConsistencyReport(null);
                setRamReport(null);
                latestSnapshot.current = null;
                sequenceRef.current = 0;
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

        port.addEventListener('message', handleMessage);
        port.start();

        return () => {
            port.removeEventListener('message', handleMessage);
            port.close();
        };
    }, []);

    return { logs, latestSnapshot, manifest, consistencyReport, ramReport };
}
