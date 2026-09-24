/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect, vi } from 'vitest';

import {
    getActivePlaybacksHandler,
    getBusStateHandler,
    getEngineLogsHandler,
    getRamReportHandler,
    getRtpcValuesHandler
} from '../runtime_tools.js';
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
        it('returns active playbacks from the snapshot', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ activePlaybacks: [{ id: 'pb_1' }] });

            const result = await getActivePlaybacksHandler(mockServer);
            expect(result).toEqual([{ id: 'pb_1' }]);
            expect(mockServer.getSnapshot).toHaveBeenCalled();
        });

        it('returns an empty array when activePlaybacks is absent', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({});

            expect(await getActivePlaybacksHandler(mockServer)).toEqual([]);
        });
    });

    describe('get_bus_state', () => {
        it('returns buses from the snapshot', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ buses: [{ id: 'bus_master' }] });

            const result = await getBusStateHandler(mockServer);
            expect(result).toEqual([{ id: 'bus_master' }]);
        });

        it('returns an empty array when buses is absent', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({});

            expect(await getBusStateHandler(mockServer)).toEqual([]);
        });
    });

    describe('get_rtpc_values', () => {
        it('returns a param→value map from the snapshot rtpcs', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({
                rtpcs: [
                    { param: 'music_vol', value: 0.8 },
                    { param: 'sfx_vol', value: 0.5 }
                ]
            });

            const result = await getRtpcValuesHandler(mockServer);
            expect(result).toEqual({ music_vol: 0.8, sfx_vol: 0.5 });
        });

        it('returns an empty object when rtpcs is absent', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({});

            expect(await getRtpcValuesHandler(mockServer)).toEqual({});
        });
    });

    describe('get_engine_logs', () => {
        it('returns logs from the snapshot', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ logs: ['log_1'] });

            expect(await getEngineLogsHandler(mockServer)).toEqual(['log_1']);
        });

        it('returns an empty array when logs is absent', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({});

            expect(await getEngineLogsHandler(mockServer)).toEqual([]);
        });
    });

    describe('get_ram_report', () => {
        it('returns the ram report from the snapshot', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ ramReport: { used: 100 } });

            expect(await getRamReportHandler(mockServer)).toEqual({ used: 100 });
        });

        it('returns an empty object when ramReport is absent', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({});

            expect(await getRamReportHandler(mockServer)).toEqual({});
        });
    });

    describe('getTelemetryLiveHandler', () => {
        it('returns combined telemetry state', async () => {
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

        it('defaults to empty arrays and object when snapshot fields are absent', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({});

            const { getTelemetryLiveHandler } = await import('../runtime_tools.js');
            const result = await getTelemetryLiveHandler(mockServer);
            expect(result).toEqual({ activePlaybacks: [], buses: [], rtpcs: {} });
        });
    });

    describe('getManifestHandler', () => {
        it('returns the manifest from the snapshot', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ manifest: { version: '1.0' } });

            const { getManifestHandler } = await import('../runtime_tools.js');
            expect(await getManifestHandler(mockServer)).toEqual({ version: '1.0' });
        });

        it('returns an empty object when manifest is absent', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({});

            const { getManifestHandler } = await import('../runtime_tools.js');
            expect(await getManifestHandler(mockServer)).toEqual({});
        });
    });

    describe('getConsistencyReportHandler', () => {
        it('returns the consistency report from the snapshot', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({ consistencyReport: { errors: [] } });

            const { getConsistencyReportHandler } = await import('../runtime_tools.js');
            expect(await getConsistencyReportHandler(mockServer)).toEqual({ errors: [] });
        });

        it('returns the default report when consistencyReport is absent', async () => {
            const mockServer = new WebSocketTelemetryServer(8080);
            mockServer.getSnapshot = vi.fn().mockReturnValue({});

            const { getConsistencyReportHandler } = await import('../runtime_tools.js');
            expect(await getConsistencyReportHandler(mockServer)).toEqual({
                isConsistent: true,
                errors: [],
                warnings: []
            });
        });
    });

    describe('trigger_event', () => {
        it('delegates to command dispatcher fireEvent', async () => {
            const mockDispatcher = { fireEvent: vi.fn() };

            const { triggerEventHandler } = await import('../runtime_tools.js');
            await triggerEventHandler(mockDispatcher as any, 'event_123');

            expect(mockDispatcher.fireEvent).toHaveBeenCalledWith('event_123');
        });
    });

    describe('set_rtpc_value', () => {
        it('delegates to command dispatcher setRtpc', async () => {
            const mockDispatcher = { setRtpc: vi.fn() };

            const { setRtpcValueHandler } = await import('../runtime_tools.js');
            await setRtpcValueHandler(mockDispatcher as any, 'rtpc_1', 0.5);

            expect(mockDispatcher.setRtpc).toHaveBeenCalledWith('rtpc_1', 0.5);
        });
    });

    describe('stop_all_sounds', () => {
        it('delegates to command dispatcher stopAll', async () => {
            const mockDispatcher = { stopAll: vi.fn() };

            const { stopAllSoundsHandler } = await import('../runtime_tools.js');
            await stopAllSoundsHandler(mockDispatcher as any);

            expect(mockDispatcher.stopAll).toHaveBeenCalled();
        });
    });

    describe('pause_engine', () => {
        it('delegates to command dispatcher pauseAll', async () => {
            const mockDispatcher = { pauseAll: vi.fn() };

            const { pauseEngineHandler } = await import('../runtime_tools.js');
            await pauseEngineHandler(mockDispatcher as any);

            expect(mockDispatcher.pauseAll).toHaveBeenCalled();
        });
    });

    describe('resume_engine', () => {
        it('delegates to command dispatcher resumeAll', async () => {
            const mockDispatcher = { resumeAll: vi.fn() };

            const { resumeEngineHandler } = await import('../runtime_tools.js');
            await resumeEngineHandler(mockDispatcher as any);

            expect(mockDispatcher.resumeAll).toHaveBeenCalled();
        });
    });

    describe('apply_mixer_snapshot', () => {
        it('delegates to command dispatcher applySnapshot', async () => {
            const mockDispatcher = { applySnapshot: vi.fn() };

            const { applyMixerSnapshotHandler } = await import('../runtime_tools.js');
            await applyMixerSnapshotHandler(mockDispatcher as any, 'snap_1', 100);

            expect(mockDispatcher.applySnapshot).toHaveBeenCalledWith('snap_1', 100);
        });
    });

    describe('debug_audio_issue_prompt', () => {
        it('returns a string referencing key telemetry resources', async () => {
            const { getDebugAudioIssuePrompt } = await import('../runtime_tools.js');
            const result = await getDebugAudioIssuePrompt();
            expect(result).toContain('scenegrid://telemetry/live');
            expect(result).toContain('scenegrid://validation/latest');
        });
    });

    describe('process_assets', () => {
        it('calls processAssets from CLI with the given options', async () => {
            const { processAssetsHandler } = await import('../runtime_tools.js');
            const cli = await import('@scene-grid/cli');
            const opts = {
                inputDir: 'in',
                outputDir: 'out',
                manifestsDir: 'man',
                quotaMb: 50,
                streamRules: [],
                streamExclusions: [],
                hash: false
            };
            await processAssetsHandler(opts);
            expect(cli.processAssets).toHaveBeenCalledWith(opts);
        });
    });

    describe('generate_aliases', () => {
        it('calls prepareAliases from CLI with input dir and output path', async () => {
            const { generateAliasesHandler } = await import('../runtime_tools.js');
            const cli = await import('@scene-grid/cli');
            await generateAliasesHandler('in', 'out.json');
            expect(cli.prepareAliases).toHaveBeenCalledWith('in', 'out.json');
        });
    });

    describe('inspect_pcm_weight', () => {
        it('returns metadata combined with computed PCM size', async () => {
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
        it('returns a dry-run report routing files by size and rules', async () => {
            const { getQuotaPreviewHandler } = await import('../runtime_tools.js');
            const cli = await import('@scene-grid/cli');
            const fs = await import('node:fs');
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readdirSync as any).mockReturnValue(['a.wav', 'b.ogg', 'ignore.txt']);
            (fs.statSync as any).mockReturnValue({ isFile: () => true });

            (cli.extractMetadata as any).mockResolvedValue({ durationSec: 10, channels: 2, sampleRate: 44100 });
            (cli.calculatePCMSize as any).mockReturnValue(3.36);
            (cli.routeAsset as any).mockImplementation((_s: number, _q: number, basename: string) =>
                basename === 'a.wav' ? 'chunk' : 'ladder'
            );

            const result = await getQuotaPreviewHandler('in', 50, [], []);

            expect(result.files['a.wav'].route).toBe('chunk');
            expect(result.files['b.ogg'].route).toBe('ladder');
            expect(result.totalMemoryMb).toBe(3.36);
        });

        it('throws when the input directory does not exist', async () => {
            const { getQuotaPreviewHandler } = await import('../runtime_tools.js');
            const fs = await import('node:fs');
            (fs.existsSync as any).mockReturnValue(false);

            await expect(getQuotaPreviewHandler('missing', 50, [], [])).rejects.toThrow('Directory not found: missing');
        });

        it('skips non-audio files in the directory', async () => {
            const { getQuotaPreviewHandler } = await import('../runtime_tools.js');
            const fs = await import('node:fs');
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readdirSync as any).mockReturnValue(['readme.txt', 'image.png']);
            (fs.statSync as any).mockReturnValue({ isFile: () => true });

            const result = await getQuotaPreviewHandler('in', 50, [], []);

            expect(Object.keys(result.files)).toHaveLength(0);
            expect(result.totalMemoryMb).toBe(0);
        });

        it('skips directory entries that are not files', async () => {
            const { getQuotaPreviewHandler } = await import('../runtime_tools.js');
            const fs = await import('node:fs');
            (fs.existsSync as any).mockReturnValue(true);
            (fs.readdirSync as any).mockReturnValue(['subdir.wav']);
            (fs.statSync as any).mockReturnValue({ isFile: () => false });

            const result = await getQuotaPreviewHandler('in', 50, [], []);

            expect(Object.keys(result.files)).toHaveLength(0);
        });
    });
});
