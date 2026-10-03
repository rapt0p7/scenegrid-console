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
    public readyState: number = 0;
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
        (MockWebSocket as any).CONNECTING = 0;
        (MockWebSocket as any).OPEN = 1;
        (MockWebSocket as any).CLOSING = 2;
        (MockWebSocket as any).CLOSED = 3;
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
                type: i % 2 === 0 ? 'LIFECYCLE' : 'CAUSE_CHAIN',
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

            const receivedLogs = replayCall.packets.filter(
                (p: any) => p.type === 'LIFECYCLE' || p.type === 'CAUSE_CHAIN'
            );
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

    describe('Requirement: Port Lifecycle Management', () => {
        it('calls start on connected ports', () => {
            const port = connectPort();
            expect(port.start).toHaveBeenCalled();
        });

        it('removes port from connectedPorts when onmessageerror fires', () => {
            const port1 = connectPort();
            const port2 = connectPort();

            port1.postMessage.mockClear();

            if (port1.onmessageerror) {
                port1.onmessageerror();
            }

            sendMessage(port2, { type: 'LIFECYCLE' });

            expect(port1.postMessage).not.toHaveBeenCalledWith({ type: 'LIFECYCLE' });
        });

        it('safely handles non-object payloads and forwards them', () => {
            const enginePort = connectPort();
            const inspectorPort = connectPort();

            inspectorPort.postMessage.mockClear();

            sendMessage(enginePort, null);
            sendMessage(enginePort, 'string-payload');

            expect(inspectorPort.postMessage).toHaveBeenCalledWith(null);
            expect(inspectorPort.postMessage).toHaveBeenCalledWith('string-payload');
        });

        it('ignores malformed batch payloads without throwing', () => {
            const enginePort = connectPort();

            expect(() => {
                sendMessage(enginePort, { size: 1, type: 'WEIRD' });
            }).not.toThrow();
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
            const spySetTimeout = vi.spyOn(global, 'setTimeout');
            const spyClearTimeout = vi.spyOn(global, 'clearTimeout');

            const enginePort = connectPort();

            sendMessage(enginePort, {
                type: 'INIT_CONFIG',
                remoteSyncUri: 'ws://localhost:8080'
            });

            const wsInstance1 = MockWebSocket.instances[0];

            if (wsInstance1.onclose) {
                wsInstance1.onclose({ code: 1006 } as any);
            }

            expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1000);

            vi.advanceTimersByTime(1000);

            expect(MockWebSocket.instances.length).toBe(2);
            expect(MockWebSocket.instances[1].url).toBe('ws://localhost:8080');

            const wsInstance2 = MockWebSocket.instances[1];
            if (wsInstance2.onclose) {
                wsInstance2.onclose({ code: 1006 } as any);
            }

            expect(spyClearTimeout).toHaveBeenCalled();
            expect(spyClearTimeout).not.toHaveBeenCalledWith(undefined);
            expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 2000);

            vi.useRealTimers();
        });
    });

    describe('Requirement: State Synchronization (FULL_SYNC)', () => {
        it('Scenario: Emits FULL_SYNC payload containing current state on ws.onopen', () => {
            const enginePort = connectPort();

            sendMessage(enginePort, { type: 'MANIFEST', payload: 'sync-test' });
            sendMessage(enginePort, {
                size: 5,
                packets: [
                    { type: 'SNAPSHOT', data: 'snap-data' },
                    { type: 'VALIDATION_REPORT', data: 'val1' },
                    { type: 'CONSISTENCY_REPORT', data: 'cons1' },
                    { type: 'RAM_REPORT', data: 'ram1' },
                    { type: 'CAUSE_CHAIN', id: 'cause1' }
                ]
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
            expect(sentMessage.payload.size).toBe(5);
            expect(sentMessage.payload.packets).toContainEqual({ type: 'MANIFEST', payload: 'sync-test' });
            expect(sentMessage.payload.packets).toContainEqual({ type: 'SNAPSHOT', data: 'snap-data' });
            expect(sentMessage.payload.packets).toContainEqual({ type: 'CONSISTENCY_REPORT', data: 'cons1' });
            expect(sentMessage.payload.packets).toContainEqual({ type: 'RAM_REPORT', data: 'ram1' });
            expect(sentMessage.payload.packets).toContainEqual({ type: 'CAUSE_CHAIN', id: 'cause1' });
        });

        it('Should not push nulls or send FULL_SYNC if all buffers are empty when ws connects', () => {
            const enginePort = connectPort();
            sendMessage(enginePort, { type: 'INIT_CONFIG', remoteSyncUri: 'ws://localhost:8080' });

            const wsInstance = MockWebSocket.instances[0];
            if (wsInstance.onopen) {
                wsInstance.onopen();
            }

            expect(wsInstance.send).not.toHaveBeenCalled();
        });

        it('Should safely ignore scalar inputs or non-object payloads', () => {
            const enginePort = connectPort();
            sendMessage(enginePort, 'not an object' as any);
            sendMessage(enginePort, null as any);

            const inspectorPort = connectPort();
            expect(inspectorPort.postMessage).not.toHaveBeenCalled();
        });

        it('Should ignore valid objects that are not batches (e.g. unknown types)', () => {
            const enginePort = connectPort();
            sendMessage(enginePort, { type: 'UNKNOWN_MSG', value: 123 });

            const inspectorPort = connectPort();
            expect(inspectorPort.postMessage).not.toHaveBeenCalled();
        });

        it('Should ignore malformed JSON from WebSocket', () => {
            const enginePort = connectPort();
            sendMessage(enginePort, { type: 'INIT_CONFIG', remoteSyncUri: 'ws://localhost:8080' });
            const wsInstance = MockWebSocket.instances[0];

            expect(() => {
                if (wsInstance.onmessage) {
                    wsInstance.onmessage({ data: 'invalid json {' } as any);
                }
            }).not.toThrow();
        });

        it('Should not establish multiple connections when one is already OPEN or CONNECTING', () => {
            const enginePort = connectPort();
            sendMessage(enginePort, { type: 'INIT_CONFIG', remoteSyncUri: 'ws://localhost:8080' });

            const ws = MockWebSocket.instances[0];
            (ws as any).readyState = 1;

            // Send again, should abort early
            sendMessage(enginePort, { type: 'INIT_CONFIG', remoteSyncUri: 'ws://localhost:8080' });

            (ws as any).readyState = 0;
            sendMessage(enginePort, { type: 'INIT_CONFIG', remoteSyncUri: 'ws://localhost:8080' });

            expect(MockWebSocket.instances.length).toBe(1);
        });

        it('Should close socket on error', () => {
            const enginePort = connectPort();
            sendMessage(enginePort, { type: 'INIT_CONFIG', remoteSyncUri: 'ws://localhost:8080' });

            const ws = MockWebSocket.instances[0];
            if (ws.onerror) {
                ws.onerror({} as any);
            }
            expect(ws.close).toHaveBeenCalledTimes(1);
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
            wsInstance.readyState = 1;
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

        it('does not forward updates if WebSocket is not OPEN', () => {
            const enginePort = connectPort();
            sendMessage(enginePort, { type: 'INIT_CONFIG', remoteSyncUri: 'ws://localhost:8080' });

            const wsInstance = MockWebSocket.instances[0];
            wsInstance.readyState = 0;
            wsInstance.send.mockClear();

            sendMessage(enginePort, { batchId: 43, size: 0, packets: [] });

            expect(wsInstance.send).not.toHaveBeenCalled();
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
