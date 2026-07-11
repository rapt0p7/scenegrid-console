import { useEffect, useRef, useCallback } from 'react';
import type { InspectorCommand } from '@scene-grid/shared';

export const useCommandTransmitter = () => {
    const channelRef = useRef<BroadcastChannel | null>(null);

    useEffect(() => {
        channelRef.current = new BroadcastChannel('scenegrid_commands');

        return () => {
            channelRef.current?.close();
            channelRef.current = null;
        };
    }, []);

    const sendCommand = useCallback((command: InspectorCommand) => {
        if (!channelRef.current) {
            console.warn('[Simulator] Cannot send command: Channel is disconnected.');
            return;
        }
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        channelRef.current.postMessage(command);
    }, []);

    return { sendCommand };
};
