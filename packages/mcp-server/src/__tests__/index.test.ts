// oxlint-disable no-await-in-loop
import { describe, it, expect, vi, beforeAll } from 'vitest';

const { mockToolCallbacks, mockResourceCallbacks, mockPromptCallbacks, mockProcessEvents } = vi.hoisted(() => ({
    mockToolCallbacks: new Map<string, Function>(),
    mockResourceCallbacks: new Map<string, Function>(),
    mockPromptCallbacks: new Map<string, Function>(),
    mockProcessEvents: new Map<string, Function>()
}));

vi.spyOn(process, 'once').mockImplementation((event, callback) => {
    mockProcessEvents.set(event as string, callback);
    return process;
});
vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
vi.spyOn(process, 'kill').mockImplementation(() => true);

vi.mock('mcp-use', () => {
    return {
        MCPServer: class {
            tool(def: any, callback: Function) {
                mockToolCallbacks.set(def.name, callback);
                return { name: def.name };
            }
            resource(def: any, callback: Function) {
                mockResourceCallbacks.set(def.uri, callback);
                return { uri: def.uri };
            }
            prompt(def: any, callback: Function) {
                mockPromptCallbacks.set(def.name, callback);
                return { name: def.name };
            }
            use() {}
        }
    };
});

vi.mock('../../src/WebSocketTelemetryServer.js', () => ({
    WebSocketTelemetryServer: class {
        start = vi.fn();
        stop = vi.fn();
    }
}));

vi.mock('../../src/validate_configurations.js', () => ({
    validateConfigurations: vi.fn().mockResolvedValue({ errors: [], warnings: [] })
}));

vi.mock('../../src/runtime_tools.js', () => {
    const mocks: any = {};
    const handlers = [
        'triggerEventHandler',
        'setRtpcValueHandler',
        'stopAllSoundsHandler',
        'pauseEngineHandler',
        'resumeEngineHandler',
        'applyMixerSnapshotHandler',
        'getQuotaPreviewHandler',
        'processAssetsHandler',
        'generateAliasesHandler',
        'inspectPcmWeightHandler',
        'getSchemaHandler',
        'queryGraphHandler',
        'traceEventHandler',
        'recordSessionTelemetryHandler',
        'getManifestHandler',
        'getTelemetryLiveHandler',
        'getConsistencyReportHandler',
        'getRamReportHandler',
        'contextConventionsHandler',
        'getDebugAudioIssuePrompt'
    ];
    for (const handler of handlers) {
        mocks[handler] = vi.fn().mockResolvedValue({});
    }
    return mocks;
});

describe('MCP Server Index', () => {
    let server: any;

    beforeAll(async () => {
        server = (await import('../../index.js')).default;
    });

    it('should export the server instance', () => {
        expect(server).toBeDefined();
    });

    it('should invoke all registered tool callbacks', async () => {
        for (const [name, callback] of mockToolCallbacks.entries()) {
            const result = await callback({});
            expect(result).toMatchSnapshot(name);
        }
    });

    it('should invoke all registered resource callbacks', async () => {
        for (const [uri, callback] of mockResourceCallbacks.entries()) {
            const result = await callback(new URL(uri), {});
            expect(result).toMatchSnapshot(uri);
        }
    });

    it('should invoke all registered prompt callbacks', async () => {
        for (const [name, callback] of mockPromptCallbacks.entries()) {
            const result = await callback({});
            expect(result).toMatchSnapshot(name);
        }
    });

    it('should execute process shutdown handlers', async () => {
        const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        const sigint = mockProcessEvents.get('SIGINT');
        expect(sigint).toBeDefined();
        await sigint!();
        expect(process.exit).toHaveBeenCalledWith(0);

        const sigusr2 = mockProcessEvents.get('SIGUSR2');
        expect(sigusr2).toBeDefined();
        await sigusr2!();
        expect(process.kill).toHaveBeenCalled();

        const sigterm = mockProcessEvents.get('SIGTERM');
        expect(sigterm).toBeDefined();
        await sigterm!();
        expect(process.exit).toHaveBeenCalledWith(0);

        consoleLogSpy.mockRestore();
    });
});
