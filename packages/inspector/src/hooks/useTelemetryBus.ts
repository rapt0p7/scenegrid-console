// noinspection D

import { useEffect, useRef, useState } from 'react';
import type {
    ITelemetryBatch,
    ITelemetrySnapshot,
    ITelemetryLifecycleEvent,
    ITelemetryCauseChain
} from '@scene-grid/shared';
import type { IEngineManifestDTO } from '../types/ManifestDTO';

const MAX_LOG_LINES = 200;

// oxlint-disable-next-line max-lines-per-function
export function useTelemetryBus(channelName: string = 'scenegrid_audio_telemetry') {
    const [logs, setLogs] = useState<Array<ITelemetryLifecycleEvent | ITelemetryCauseChain>>([]);
    const [manifest, setManifest] = useState<IEngineManifestDTO | null>(null);
    const latestSnapshot = useRef<ITelemetrySnapshot | null>(null);

    useEffect(() => {
        const channel = new BroadcastChannel(channelName);

        // oxlint-disable-next-line unicorn/prefer-add-event-listener
        channel.onmessage = (event: MessageEvent) => {
            const data = event.data;
            const newLogs: Array<ITelemetryLifecycleEvent | ITelemetryCauseChain> = [];

            if (data?.type === 'MANIFEST') {
                setManifest(data.payload as IEngineManifestDTO);
                return;
            }

            const batch = data as ITelemetryBatch;

            for (let i = 0; i < batch.size; i++) {
                const packet = batch.packets[i];

                if (packet.type === 'SNAPSHOT') {
                    latestSnapshot.current = packet;
                } else if (packet.type === 'LIFECYCLE' || packet.type === 'CAUSE_CHAIN') {
                    newLogs.push(packet);
                }
            }

            if (newLogs.length > 0) {
                setLogs(prevLogs => {
                    const combined = [...newLogs, ...prevLogs];
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

    return { logs, latestSnapshot, manifest };
}
