// oxlint-disable typescript/require-await
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
