/* eslint-disable @typescript-eslint/naming-convention */
// oxlint-disable typescript/require-await
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WebSocketTelemetryServer } from './WebSocketTelemetryServer.js';

export async function getActivePlaybacksHandler(server: WebSocketTelemetryServer): Promise<any[]> {
    const snapshot = server.getSnapshot();
    return snapshot.activePlaybacks || [];
}

export async function getBusStateHandler(server: WebSocketTelemetryServer): Promise<any[]> {
    const snapshot = server.getSnapshot();
    return snapshot.buses || [];
}

export async function getRtpcValuesHandler(server: WebSocketTelemetryServer): Promise<Record<string, number>> {
    const snapshot = server.getSnapshot();
    const rtpcs = snapshot.rtpcs || [];
    const map: Record<string, number> = {};
    for (const r of rtpcs) {
        map[r.param] = r.value;
    }
    return map;
}

export async function getTelemetryLiveHandler(server: WebSocketTelemetryServer): Promise<any> {
    const snapshot = server.getSnapshot();

    const rtpcs = snapshot.rtpcs || [];
    const rtpcMap: Record<string, number> = {};
    for (const r of rtpcs) {
        rtpcMap[r.param] = r.value;
    }

    return {
        activePlaybacks: snapshot.activePlaybacks || [],
        buses: snapshot.buses || [],
        rtpcs: rtpcMap
    };
}

export async function getEngineLogsHandler(server: WebSocketTelemetryServer): Promise<any[]> {
    const snapshot = server.getSnapshot();
    return snapshot.logs || [];
}

export async function getRamReportHandler(server: WebSocketTelemetryServer): Promise<any> {
    const snapshot = server.getSnapshot();
    return snapshot.ramReport || {};
}

export async function getConsistencyReportHandler(server: WebSocketTelemetryServer): Promise<any> {
    const snapshot = server.getSnapshot();
    return snapshot.consistencyReport || { isConsistent: true, errors: [], warnings: [] };
}

export async function getManifestHandler(server: WebSocketTelemetryServer): Promise<any> {
    const snapshot = server.getSnapshot();
    return snapshot.manifest || {};
}

export async function triggerEventHandler(dispatcher: any, eventId: string): Promise<void> {
    dispatcher.fireEvent(eventId);
}

export async function setRtpcValueHandler(dispatcher: any, param: string, value: number): Promise<void> {
    dispatcher.setRtpc(param, value);
}

export async function stopAllSoundsHandler(dispatcher: any): Promise<void> {
    dispatcher.stopAll();
}

export async function pauseEngineHandler(dispatcher: any): Promise<void> {
    dispatcher.pauseAll();
}

export async function resumeEngineHandler(dispatcher: any): Promise<void> {
    dispatcher.resumeAll();
}

export async function applyMixerSnapshotHandler(
    dispatcher: any,
    snapshotId: string,
    transitionTimeMs?: number
): Promise<void> {
    dispatcher.applySnapshot(snapshotId, transitionTimeMs);
}

export async function getDebugAudioIssuePrompt(): Promise<string> {
    return `To debug an audio issue:
1. Fetch the manifest resource from \`scenegrid://manifest/current\` to verify the sound exists and its routing.
2. Fetch the live telemetry resource from \`scenegrid://telemetry/live\` to check if the voice is currently active, and inspect bus volumes or ducking state.
3. Fetch the validation resource from \`scenegrid://validation/latest\` to see if there are any consistency errors preventing playback.
4. If needed, use \`trigger_event\` to manually restart the event and observe the telemetry changes.`;
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function processAssetsHandler(options: any): Promise<void> {
    const { processAssets } = await import('@scene-grid/cli');
    await processAssets(options);
}

export async function generateAliasesHandler(inputDir: string, outputPath: string): Promise<void> {
    const { prepareAliases } = await import('@scene-grid/cli');
    await prepareAliases(inputDir, outputPath);
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function inspectPcmWeightHandler(filePath: string): Promise<any> {
    const { extractMetadata, calculatePCMSize } = await import('@scene-grid/cli');
    const metadata = await extractMetadata(filePath);
    const sizeMb = calculatePCMSize(metadata.durationSec, metadata.channels, metadata.sampleRate);

    return {
        ...metadata,
        exactSizeMb: sizeMb,
        exactSizeBytes: Math.floor(sizeMb * 1024 * 1024)
    };
}

// oxlint-disable-next-line typescript/no-explicit-any
export async function getQuotaPreviewHandler(
    inputDir: string,
    quotaMb: number,
    streamRules: string[],
    streamExclusions: string[]
    // oxlint-disable-next-line typescript/no-explicit-any
): Promise<any> {
    const { extractMetadata, calculatePCMSize, routeAsset } = await import('@scene-grid/cli');

    if (!fs.existsSync(inputDir)) {
        throw new Error(`Directory not found: ${inputDir}`);
    }

    const files = fs.readdirSync(inputDir);
    // oxlint-disable-next-line typescript/no-explicit-any
    const report: any = {
        totalMemoryMb: 0,
        files: {}
    };

    for (const file of files) {
        const fullPath = path.join(inputDir, file);
        if (
            fs.statSync(fullPath).isFile() &&
            (file.endsWith('.wav') || file.endsWith('.ogg') || file.endsWith('.mp3'))
        ) {
            // oxlint-disable-next-line no-await-in-loop
            const metadata = await extractMetadata(fullPath);
            const sizeMb = calculatePCMSize(metadata.durationSec, metadata.channels, metadata.sampleRate);
            const route = routeAsset(sizeMb, quotaMb, file, streamRules, streamExclusions);

            report.files[file] = {
                sizeMb,
                route
            };

            if (route === 'ladder') {
                report.totalMemoryMb += sizeMb;
            }
        }
    }

    return report;
}
export async function queryGraphHandler(server: WebSocketTelemetryServer, queryPath: string): Promise<any> {
    const snapshot = server.getSnapshot();
    const manifest = snapshot.manifest;
    if (!manifest) return null;

    const parts = queryPath.split('.');
    let current = manifest;
    for (const part of parts) {
        if (current === null || typeof current !== 'object') return null;
        current = current[part];
    }
    return current;
}

export async function traceEventHandler(server: WebSocketTelemetryServer): Promise<any[]> {
    return server.getTraceHistory();
}

export async function recordSessionTelemetryHandler(server: WebSocketTelemetryServer, state: 'start' | 'stop'): Promise<any> {
    if (state === 'start') {
        server.startRecording();
        return { status: 'recording_started' };
    } else if (state === 'stop') {
        return server.stopRecording();
    }
    throw new Error('Invalid state for record_session_telemetry');
}
export async function contextConventionsHandler(workspaceRoot: string): Promise<string> {
    const p1 = path.join(workspaceRoot, 'AGENTS.md');
    const p2 = path.join(workspaceRoot, '.agents', 'AGENTS.md');

    if (fs.existsSync(p1)) return fs.readFileSync(p1, 'utf-8');
    if (fs.existsSync(p2)) return fs.readFileSync(p2, 'utf-8');

    return 'No agent conventions found.';
}

export async function getSchemaHandler(variant: 'referenced' | 'dereferenced', targetSlice?: string): Promise<any> {
    const { fileURLToPath } = await import('node:url');

    const currentFilename = fileURLToPath(import.meta.url);
    const currentDirname = path.dirname(currentFilename);
    const schemaDir = path.join(currentDirname, '../generated');
    const filename = variant === 'dereferenced' ? 'schema.dereferenced.json' : 'schema.json';
    const filepath = path.join(schemaDir, filename);

    if (!fs.existsSync(filepath)) {
        throw new Error(`Schema file not found: ${filepath}`);
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const schema = JSON.parse(content);

    if (variant === 'dereferenced' && targetSlice) {
        if (schema.definitions && schema.definitions[targetSlice]) {
            return schema.definitions[targetSlice];
        }
        throw new Error(`Slice ${targetSlice} not found in dereferenced schema`);
    }

    return schema;
}
