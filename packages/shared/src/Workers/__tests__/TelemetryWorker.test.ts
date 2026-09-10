// noinspection D

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

class MockMessagePort {
    onmessage: ((ev: any) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    postMessage = vi.fn();
    start = vi.fn();
}

// oxlint-disable-next-line max-classes-per-file
class MockWebSocket {
    static instances: MockWebSocket[] = [];
    public url: string;
    public onopen: (() => void) | null = null;
    public onclose: ((ev: any) => void) | null = null;
    public onmessage: ((ev: any) => void) | null = null;
    public onerror: ((ev: any) => void) | null = null;
    public send = vi.fn();
    public close = vi.fn();

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }
}

describe('Inspector-Engine-Sync SharedWorker Business Logic', () => {
    let mockSelf: { onconnect: ((event: any) => void) | null };

    beforeEach(async () => {
        vi.resetModules();
        MockWebSocket.instances = [];
        (globalThis as any).WebSocket = MockWebSocket;

        mockSelf = { onconnect: null };

        (globalThis as any).self = mockSelf;

        await import('../TelemetryWorker.js');
    });

    afterEach(() => {
        vi.clearAllMocks();
        delete (globalThis as any).WebSocket;
    });

    const connectPort = (): MockMessagePort => {
        const port = new MockMessagePort();

        if (mockSelf.onconnect) {
            mockSelf.onconnect({ ports: [port] });
        }

        return port;
    };

    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const sendMessage = (port: MockMessagePort, data: any) => {
        if (port.onmessage) {
            port.onmessage({ data } as any);
        }
    };

    describe('Requirement: SharedWorker buffers telemetry state', () => {
        it('Scenario: Engine dispatches telemetry (Maintains bounded circular buffer)', () => {
            const enginePort = connectPort();

            const manifestPayload = { type: 'MANIFEST', payload: { version: '1.0' } };
            sendMessage(enginePort, manifestPayload);

            const logs = Array.from({ length: 205 }).map((_, i) => ({
                type: 'LIFECYCLE',
                id: i
            }));

            sendMessage(enginePort, {
                size: 208,
                packets: [
                    { type: 'SNAPSHOT', data: 'snap1' },
                    { type: 'VALIDATION_REPORT', data: 'val1' },
                    { type: 'RAM_REPORT', data: 'ram1' },
                    ...logs
                ]
            });

            const inspectorPort = connectPort();

            expect(inspectorPort.postMessage).toHaveBeenNthCalledWith(1, manifestPayload);

            const replayCall = inspectorPort.postMessage.mock.calls[1][0];
            expect(replayCall.batchId).toBe(-1);

            expect(replayCall.packets.length).toBe(203);

            const receivedLogs = replayCall.packets.filter((p: any) => p.type === 'LIFECYCLE');
            expect(receivedLogs.length).toBe(200);
            expect(receivedLogs[0].id).toBe(5);
            expect(receivedLogs[199].id).toBe(204);
        });
    });

    describe('Requirement: Inspector recovers full history on boot', () => {
        it('Scenario: Inspector boots after engine', () => {
            const enginePort = connectPort();

            sendMessage(enginePort, { type: 'MANIFEST', payload: 'A' });
            sendMessage(enginePort, {
                size: 2,
                packets: [
                    { type: 'SNAPSHOT', id: 's1' },
                    { type: 'CAUSE_CHAIN', id: 'c1' }
                ]
            });

            const inspectorPort = connectPort();

            expect(inspectorPort.postMessage).toHaveBeenCalledTimes(2);

            const replayBatch = inspectorPort.postMessage.mock.calls[1][0];
            expect(replayBatch.packets).toContainEqual({ type: 'SNAPSHOT', id: 's1' });
            expect(replayBatch.packets).toContainEqual({ type: 'CAUSE_CHAIN', id: 'c1' });
        });

        it('Should broadcast realtime updates to already connected inspectors', () => {
            const enginePort = connectPort();
            const inspectorPort = connectPort();

            inspectorPort.postMessage.mockClear();

            const newBatch = { size: 1, packets: [{ type: 'LIFECYCLE', id: 'new' }] };
            sendMessage(enginePort, newBatch);

            expect(inspectorPort.postMessage).toHaveBeenCalledWith(newBatch);
            expect(enginePort.postMessage).not.toHaveBeenCalledWith(newBatch);
        });
    });

    describe('Requirement: Inspector resets state on new manifest broadcast', () => {
        it('Scenario: Engine restarts while inspector is open', () => {
            const enginePort = connectPort();
            const inspectorPort1 = connectPort();

            sendMessage(enginePort, { type: 'MANIFEST', payload: 'run-1' });
            sendMessage(enginePort, {
                size: 1,
                packets: [{ type: 'SNAPSHOT', data: 'old-snapshot' }]
            });

            const newManifest = { type: 'MANIFEST', payload: 'run-2' };
            sendMessage(enginePort, newManifest);

            expect(inspectorPort1.postMessage).toHaveBeenCalledWith(newManifest);

            const inspectorPort2 = connectPort();

            expect(inspectorPort2.postMessage).toHaveBeenCalledTimes(1);
            expect(inspectorPort2.postMessage).toHaveBeenCalledWith(newManifest);

            const messages = inspectorPort2.postMessage.mock.calls.map(call => call[0]);
            const replayBatches = messages.filter(msg => msg.batchId === -1);
            expect(replayBatches.length).toBe(0);
        });
    });

    describe('Requirement: Engine establishes remote synchronization connection', () => {
        it('Scenario: Successful connection and full sync - establishes connection via config payload', () => {
            const enginePort = connectPort();

            sendMessage(enginePort, {
                type: 'INIT_CONFIG',
                remoteSyncUri: 'ws://localhost:8080'
            });

            expect(MockWebSocket.instances.length).toBe(1);
            expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8080');
        });

        it('Should implement an exponential backoff reconnection loop if the connection closes', () => {
            vi.useFakeTimers();
            const enginePort = connectPort();

            sendMessage(enginePort, {
                type: 'INIT_CONFIG',
                remoteSyncUri: 'ws://localhost:8080'
            });

            const wsInstance1 = MockWebSocket.instances[0];

            if (wsInstance1.onclose) {
                wsInstance1.onclose({ code: 1006 } as any);
            }

            vi.advanceTimersByTime(1500);

            expect(MockWebSocket.instances.length).toBe(2);
            expect(MockWebSocket.instances[1].url).toBe('ws://localhost:8080');

            vi.useRealTimers();
        });
    });

    describe('Requirement: State Synchronization (FULL_SYNC)', () => {
        it('Scenario: Emits FULL_SYNC payload containing current state on ws.onopen', () => {
            const enginePort = connectPort();

            sendMessage(enginePort, { type: 'MANIFEST', payload: 'sync-test' });
            sendMessage(enginePort, {
                size: 1,
                packets: [{ type: 'SNAPSHOT', data: 'snap-data' }]
            });

            sendMessage(enginePort, {
                type: 'INIT_CONFIG',
                remoteSyncUri: 'ws://localhost:8080'
            });

            const wsInstance = MockWebSocket.instances[0];

            if (wsInstance.onopen) {
                wsInstance.onopen();
            }

            expect(wsInstance.send).toHaveBeenCalledTimes(1);

            const sentMessage = JSON.parse(wsInstance.send.mock.calls[0][0]);
            expect(sentMessage.type).toBe('FULL_SYNC');
            expect(sentMessage.payload.batchId).toBe(-1);
            expect(sentMessage.payload.packets).toContainEqual({ type: 'MANIFEST', payload: 'sync-test' });
            expect(sentMessage.payload.packets).toContainEqual({ type: 'SNAPSHOT', data: 'snap-data' });
        });
    });

    describe('Requirement: Telemetry Streaming', () => {
        it('Scenario: Telemetry tick stream - forwards updates to the WebSocket', () => {
            const enginePort = connectPort();

            sendMessage(enginePort, {
                type: 'INIT_CONFIG',
                remoteSyncUri: 'ws://localhost:8080'
            });

            const wsInstance = MockWebSocket.instances[0];
            if (wsInstance.onopen) {
                wsInstance.onopen();
            }

            wsInstance.send.mockClear();

            const telemetryBatch = {
                batchId: 42,
                size: 1,
                packets: [{ type: 'SNAPSHOT', data: 'live-data' }]
            };

            sendMessage(enginePort, telemetryBatch);

            expect(wsInstance.send).toHaveBeenCalledTimes(1);

            const sentMessage = JSON.parse(wsInstance.send.mock.calls[0][0]);
            expect(sentMessage.batchId).toBe(42);
            expect(sentMessage.packets[0].data).toBe('live-data');
        });
    });

    describe('Requirement: Command Proxying', () => {
        it('Scenario: Remote command execution - proxies WebSocket commands to MessagePort', () => {
            const enginePort = connectPort();

            sendMessage(enginePort, {
                type: 'INIT_CONFIG',
                remoteSyncUri: 'ws://localhost:8080'
            });

            const wsInstance = MockWebSocket.instances[0];

            enginePort.postMessage.mockClear();

            const remoteCommand = { type: 'APPLY_SNAPSHOT', id: 'remote-1' };

            if (wsInstance.onmessage) {
                wsInstance.onmessage({ data: JSON.stringify(remoteCommand) });
            }

            expect(enginePort.postMessage).toHaveBeenCalledTimes(1);
            expect(enginePort.postMessage).toHaveBeenCalledWith(remoteCommand);
        });
    });
});
