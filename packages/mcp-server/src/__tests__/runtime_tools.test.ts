/* eslint-disable @typescript-eslint/naming-convention */
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

    describe('getTelemetryLiveHandler', () => {
        it('should retrieve combined telemetry state', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({
                activePlaybacks: [{ id: 'pb_1' }],
                buses: [{ id: 'bus_1' }],
                rtpcs: [{ param: 'p_1', value: 0.5 }]
            });

            const { getTelemetryLiveHandler } = await import('../runtime_tools.js');
            const result = await getTelemetryLiveHandler(mockServer);
            expect(result).toEqual({
                activePlaybacks: [{ id: 'pb_1' }],
                buses: [{ id: 'bus_1' }],
                rtpcs: { p_1: 0.5 }
            });
        });
    });

    describe('getManifestHandler', () => {
        it('should retrieve manifest', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ manifest: { version: '1.0' } });

            const { getManifestHandler } = await import('../runtime_tools.js');
            const result = await getManifestHandler(mockServer);
            expect(result).toEqual({ version: '1.0' });
        });
    });

    describe('getValidationHandler', () => {
        it('should retrieve consistency report', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ consistencyReport: { errors: [] } });

            const { getConsistencyReportHandler } = await import('../runtime_tools.js');
            const result = await getConsistencyReportHandler(mockServer);
            expect(result).toEqual({ errors: [] });
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

    describe('stop_all_sounds', () => {
        it('should delegate to command dispatcher', async () => {
            const mockDispatcher = { stopAll: vi.fn() };
            const { stopAllSoundsHandler } = await import('../runtime_tools.js');
            await stopAllSoundsHandler(mockDispatcher as any);
            expect(mockDispatcher.stopAll).toHaveBeenCalled();
        });
    });

    describe('pause_engine', () => {
        it('should delegate to command dispatcher', async () => {
            const mockDispatcher = { pauseAll: vi.fn() };
            const { pauseEngineHandler } = await import('../runtime_tools.js');
            await pauseEngineHandler(mockDispatcher as any);
            expect(mockDispatcher.pauseAll).toHaveBeenCalled();
        });
    });

    describe('resume_engine', () => {
        it('should delegate to command dispatcher', async () => {
            const mockDispatcher = { resumeAll: vi.fn() };
            const { resumeEngineHandler } = await import('../runtime_tools.js');
            await resumeEngineHandler(mockDispatcher as any);
            expect(mockDispatcher.resumeAll).toHaveBeenCalled();
        });
    });

    describe('apply_mixer_snapshot', () => {
        it('should delegate to command dispatcher', async () => {
            const mockDispatcher = { applySnapshot: vi.fn() };
            const { applyMixerSnapshotHandler } = await import('../runtime_tools.js');
            await applyMixerSnapshotHandler(mockDispatcher as any, 'snap_1', 100);
            expect(mockDispatcher.applySnapshot).toHaveBeenCalledWith('snap_1', 100);
        });
    });

    describe('debug_audio_issue_prompt', () => {
        it('should return the correct system message', async () => {
            const { getDebugAudioIssuePrompt } = await import('../runtime_tools.js');
            const result = await getDebugAudioIssuePrompt();
            expect(result).toContain('scenegrid://telemetry/live');
            expect(result).toContain('scenegrid://validation/latest');
        });
    });
});
