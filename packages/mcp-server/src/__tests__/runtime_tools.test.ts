/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect, vi } from 'vitest';

import { getActivePlaybacksHandler, getEngineLogsHandler, getRamReportHandler } from '../runtime_tools.js';
import { WebSocketTelemetryServer } from '../WebSocketTelemetryServer.js';

vi.mock('../WebSocketTelemetryServer.js');
vi.mock('node:fs', () => ({
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    existsSync: vi.fn()
}));
vi.mock('@scene-grid/cli', () => ({
    processAssets: vi.fn(),
    prepareAliases: vi.fn(),
    extractMetadata: vi.fn(),
    calculatePCMSize: vi.fn(),
    routeAsset: vi.fn()
}));
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

    describe('process_assets', () => {
        it('should call processAssets from CLI', async () => {
            const { processAssetsHandler } = await import('../runtime_tools.js');
            const cli = await import('@scene-grid/cli');
            await processAssetsHandler({
                inputDir: 'in',
                outputDir: 'out',
                manifestsDir: 'man',
                quotaMb: 50,
                streamRules: [],
                streamExclusions: [],
                hash: false
            });
            expect(cli.processAssets).toHaveBeenCalledWith({
                inputDir: 'in',
                outputDir: 'out',
                manifestsDir: 'man',
                quotaMb: 50,
                streamRules: [],
                streamExclusions: [],
                hash: false
            });
        });
    });

    describe('generate_aliases', () => {
        it('should call prepareAliases from CLI', async () => {
            const { generateAliasesHandler } = await import('../runtime_tools.js');
            const cli = await import('@scene-grid/cli');
            await generateAliasesHandler('in', 'out.json');
            expect(cli.prepareAliases).toHaveBeenCalledWith('in', 'out.json');
        });
    });

    describe('inspect_pcm_weight', () => {
        it('should extract metadata and calculate PCM size', async () => {
            const { inspectPcmWeightHandler } = await import('../runtime_tools.js');
            const cli = await import('@scene-grid/cli');
            (cli.extractMetadata as any).mockResolvedValue({ durationSec: 10, channels: 2, sampleRate: 44100 });
            (cli.calculatePCMSize as any).mockReturnValue(3.36);

            const result = await inspectPcmWeightHandler('file.wav');

            expect(cli.extractMetadata).toHaveBeenCalledWith('file.wav');
            expect(cli.calculatePCMSize).toHaveBeenCalledWith(10, 2, 44100);
            expect(result).toEqual({
                durationSec: 10,
                channels: 2,
                sampleRate: 44100,
                exactSizeBytes: 3523215,
                exactSizeMb: 3.36
            });
        });
    });

    describe('getQuotaPreviewHandler', () => {
        it('should return dry run report based on CLI logic', async () => {
            const { getQuotaPreviewHandler } = await import('../runtime_tools.js');
            const cli = await import('@scene-grid/cli');
            const fs = await import('node:fs');
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readdirSync as any).mockReturnValue(['a.wav', 'b.ogg']);
            (fs.statSync as any).mockReturnValue({ isFile: () => true });

            (cli.extractMetadata as any).mockResolvedValue({ durationSec: 10, channels: 2, sampleRate: 44100 });
            (cli.calculatePCMSize as any).mockReturnValue(3.36);
            (cli.routeAsset as any).mockImplementation((size: number, q: number, b: string) =>
                b === 'a.wav' ? 'chunk' : 'ladder'
            );

            const result = await getQuotaPreviewHandler('in', 50, [], []);

            expect(result.files['a.wav'].route).toBe('chunk');
            expect(result.files['b.ogg'].route).toBe('ladder');
            expect(result.totalMemoryMb).toBe(3.36); // b.ogg is ladder, a.wav is chunk (but chunk takes zero memory in dry run? We'll define totalMemory as total ladder memory)
        });
    });
});
