import type { InspectorCommand } from '@scene-grid/shared';

import { createTelemetryWorker } from '@scene-grid/shared';
import { useEffect, useRef, useCallback } from 'react';

export const useCommandTransmitter = () => {
    const portRef = useRef<MessagePort | null>(null);

    useEffect(() => {
        const worker = createTelemetryWorker({ name: 'SceneGridTelemetry' });
        portRef.current = worker.port;
        portRef.current.start();

        return () => {
            portRef.current?.close();
            portRef.current = null;
        };
    }, []);

    const sendCommand = useCallback((command: InspectorCommand) => {
        if (!portRef.current) {
            console.warn('[Simulator] Cannot send command: Worker port is disconnected.');
            return;
        }

        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        portRef.current.postMessage(command);
    }, []);

    return { sendCommand };
};
