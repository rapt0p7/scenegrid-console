import { describe, it, expect, vi } from 'vitest';

import { CommandDispatcher } from '../CommandDispatcher.js';

describe('CommandDispatcher', () => {
    it('should format exact FIRE_EVENT, SET_RTPC, and GLOBAL_ACTION payloads', () => {
        const mockBroadcast = vi.fn();
        const dispatcher = new CommandDispatcher({ broadcast: mockBroadcast });

        dispatcher.fireEvent('ev_123');
        expect(mockBroadcast).toHaveBeenCalledWith(
            JSON.stringify({
                type: 'FIRE_EVENT',
                eventId: 'ev_123'
            })
        );

        dispatcher.setRtpc('prm_456', 0.5);
        expect(mockBroadcast).toHaveBeenCalledWith(
            JSON.stringify({
                type: 'SET_RTPC',
                param: 'prm_456',
                value: 0.5,
                isOverride: true
            })
        );

        dispatcher.globalAction('pause');
        expect(mockBroadcast).toHaveBeenCalledWith(
            JSON.stringify({
                type: 'GLOBAL_ACTION',
                action: 'pause'
            })
        );

        dispatcher.stopAll();
        expect(mockBroadcast).toHaveBeenCalledWith(
            JSON.stringify({
                type: 'GLOBAL_ACTION',
                action: 'STOP_ALL'
            })
        );

        dispatcher.pauseAll();
        expect(mockBroadcast).toHaveBeenCalledWith(
            JSON.stringify({
                type: 'GLOBAL_ACTION',
                action: 'PAUSE_ALL'
            })
        );

        dispatcher.resumeAll();
        expect(mockBroadcast).toHaveBeenCalledWith(
            JSON.stringify({
                type: 'GLOBAL_ACTION',
                action: 'RESUME_ALL'
            })
        );

        dispatcher.applySnapshot('snap_master', 500);
        expect(mockBroadcast).toHaveBeenCalledWith(
            JSON.stringify({
                type: 'APPLY_SNAPSHOT',
                snapshotId: 'snap_master',
                fadeTime: 500
            })
        );
    });
});
