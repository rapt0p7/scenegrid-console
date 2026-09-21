import { describe, it, expect, vi } from 'vitest';

import { getActivePlaybacksHandler, getEngineLogsHandler, getRamReportHandler } from '../runtime_tools.js';
import { WebSocketTelemetryServer } from '../WebSocketTelemetryServer.js';

vi.mock('../WebSocketTelemetryServer.js');

describe('runtime tools', () => {
    describe('get_active_playbacks', () => {
        it('should correctly retrieve active playbacks', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ activePlaybacks: [{ id: 'pb_1' }] });

            const result = await getActivePlaybacksHandler(mockServer);
            expect(result).toEqual([{ id: 'pb_1' }]);
            expect(mockServer.getSnapshot).toHaveBeenCalled();
        });
    });

    describe('get_engine_logs', () => {
        it('should correctly retrieve engine logs', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ logs: ['log_1'] });

            const result = await getEngineLogsHandler(mockServer);
            expect(result).toEqual(['log_1']);
        });
    });

    describe('get_ram_report', () => {
        it('should correctly retrieve ram report', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ ramReport: { used: 100 } });

            const result = await getRamReportHandler(mockServer);
            expect(result).toEqual({ used: 100 });
        });
    });

    describe('trigger_event', () => {
        it('should delegate to command dispatcher', async () => {
            const mockDispatcher = { fireEvent: vi.fn(), setRtpc: vi.fn(), globalAction: vi.fn() };

            const { triggerEventHandler } = await import('../runtime_tools.js');
            await triggerEventHandler(mockDispatcher as any, 'event_123');

            expect(mockDispatcher.fireEvent).toHaveBeenCalledWith('event_123');
        });
    });

    describe('set_rtpc_value', () => {
        it('should delegate to command dispatcher', async () => {
            const mockDispatcher = { fireEvent: vi.fn(), setRtpc: vi.fn(), globalAction: vi.fn() };

            const { setRtpcValueHandler } = await import('../runtime_tools.js');
            await setRtpcValueHandler(mockDispatcher as any, 'rtpc_1', 0.5);

            expect(mockDispatcher.setRtpc).toHaveBeenCalledWith('rtpc_1', 0.5);
        });
    });
});
