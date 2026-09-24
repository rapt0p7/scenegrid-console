import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
// oxlint-disable-next-line import/no-named-as-default
import WebSocket from 'ws';

import { WebSocketTelemetryServer } from '../WebSocketTelemetryServer.js';

const TEST_PORT = 8089;

function sendAndWait(client: WebSocket, payload: unknown, ms = 50): Promise<void> {
    return new Promise((resolve, reject) => {
        client.send(JSON.stringify(payload));
        setTimeout(resolve, ms);
        client.once('error', reject);
    });
}

function connectClient(port: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}`);
        ws.once('open', () => {
            resolve(ws);
        });
        ws.once('error', reject);
    });
}

describe('WebSocketTelemetryServer', () => {
    let server: WebSocketTelemetryServer;

    beforeAll(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    beforeEach(async () => {
        server = new WebSocketTelemetryServer(TEST_PORT);
        await server.start();
    });

    afterEach(async () => {
        await server.stop();
    });

    it('starts and returns an empty snapshot before any messages', () => {
        expect(server.getSnapshot()).toEqual({});
    });

    it('resolves stop() immediately when server was never started', async () => {
        const unstarted = new WebSocketTelemetryServer(0);
        await expect(unstarted.stop()).resolves.toBeUndefined();
    });

    it('parses a batchId packet and updates SNAPSHOT fields', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, {
            batchId: 1,
            packets: [{ type: 'SNAPSHOT', activePlaybacks: [{ id: 'pb_1', state: 'playing' }] }]
        });
        client.close();
        expect(server.getSnapshot().activePlaybacks).toEqual([{ id: 'pb_1', state: 'playing' }]);
    });

    it('parses buses and rtpcs from a SNAPSHOT packet', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, {
            batchId: 2,
            packets: [
                {
                    type: 'SNAPSHOT',
                    buses: [{ id: 'bus_master' }],
                    rtpcs: [{ param: 'music_vol', value: 0.8 }]
                }
            ]
        });
        client.close();
        expect(server.getSnapshot().buses).toEqual([{ id: 'bus_master' }]);
        expect(server.getSnapshot().rtpcs).toEqual([{ param: 'music_vol', value: 0.8 }]);
    });

    it('stores a MANIFEST packet from the packet array', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, {
            batchId: 3,
            packets: [{ type: 'MANIFEST', payload: { version: '2.0' } }]
        });
        client.close();
        expect(server.getSnapshot().manifest).toEqual({ version: '2.0' });
    });

    it('stores a top-level MANIFEST message (not inside packets array)', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, { type: 'MANIFEST', payload: { version: '3.0' } });
        client.close();
        expect(server.getSnapshot().manifest).toEqual({ version: '3.0' });
    });

    it('processes a FULL_SYNC message and resets logs', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, {
            type: 'FULL_SYNC',
            payload: {
                packets: [{ type: 'SNAPSHOT', activePlaybacks: [{ id: 'full_pb' }] }]
            }
        });
        client.close();
        expect(server.getSnapshot().activePlaybacks).toEqual([{ id: 'full_pb' }]);
        expect(server.getSnapshot().logs).toEqual([]);
    });

    it('appends CAUSE_CHAIN packets to logs', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, {
            batchId: 4,
            packets: [{ type: 'CAUSE_CHAIN', chain: ['a', 'b'] }]
        });
        client.close();
        expect(server.getSnapshot().logs).toContainEqual({ type: 'CAUSE_CHAIN', chain: ['a', 'b'] });
    });

    it('appends LIFECYCLE packets to logs', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, {
            batchId: 5,
            packets: [{ type: 'LIFECYCLE', event: 'start' }]
        });
        client.close();
        expect(server.getSnapshot().logs).toContainEqual({ type: 'LIFECYCLE', event: 'start' });
    });

    it('caps logs at 200 entries by shifting oldest', async () => {
        const client = await connectClient(TEST_PORT);
        const packets = Array.from({ length: 202 }, (_, i) => ({ type: 'CAUSE_CHAIN', i }));
        await sendAndWait(client, { batchId: 6, packets }, 200);
        client.close();
        expect(server.getSnapshot().logs!.length).toBe(200);
    });

    it('stores RAM_REPORT packets', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, {
            batchId: 7,
            packets: [{ type: 'RAM_REPORT', report: { usedMb: 42 } }]
        });
        client.close();
        expect(server.getSnapshot().ramReport).toEqual({ usedMb: 42 });
    });

    it('falls back to the packet itself when RAM_REPORT has no report field', async () => {
        const client = await connectClient(TEST_PORT);
        const ramPacket = { type: 'RAM_REPORT', usedMb: 99 };
        await sendAndWait(client, { batchId: 8, packets: [ramPacket] });
        client.close();
        expect(server.getSnapshot().ramReport).toEqual(ramPacket);
    });

    it('stores CONSISTENCY_REPORT packets', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, {
            batchId: 9,
            packets: [{ type: 'CONSISTENCY_REPORT', errors: [], warnings: [] }]
        });
        client.close();
        expect(server.getSnapshot().consistencyReport).toEqual({
            type: 'CONSISTENCY_REPORT',
            errors: [],
            warnings: []
        });
    });

    it('skips null entries in the packets array gracefully', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, { batchId: 10, packets: [null, { type: 'SNAPSHOT', buses: [] }] });
        client.close();
        expect(server.getSnapshot().buses).toEqual([]);
    });

    it('warns and does not throw when a message contains invalid JSON', async () => {
        const client = await connectClient(TEST_PORT);
        await new Promise<void>((resolve, reject) => {
            client.send('not-json-at-all');
            setTimeout(resolve, 50);
            client.once('error', reject);
        });
        client.close();
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('[TelemetryServer] Failed to parse message'),
            expect.anything()
        );
    });

    it('broadcasts a message to all connected clients', async () => {
        const client1 = await connectClient(TEST_PORT);
        const client2 = await connectClient(TEST_PORT);

        const received: string[] = [];
        // oxlint-disable-next-line typescript/strict-void-return typescript/no-base-to-string
        client1.on('message', d => received.push(d.toString()));
        // oxlint-disable-next-line typescript/strict-void-return typescript/no-base-to-string
        client2.on('message', d => received.push(d.toString()));

        server.broadcast('hello');
        await new Promise(r => setTimeout(r, 50));

        client1.close();
        client2.close();

        expect(received).toHaveLength(2);
        expect(received[0]).toBe('hello');
    });

    it('broadcast is a no-op when no clients are connected', () => {
        expect(() => {
            server.broadcast('silent');
        }).not.toThrow();
    });

    it('removes the client from the set when it disconnects', async () => {
        const client = await connectClient(TEST_PORT);
        client.close();
        await new Promise(r => setTimeout(r, 50));
        server.broadcast('after-disconnect');
    });

    it('ignores payloads with batchId but non-array packets', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, { batchId: 11, packets: 'not-an-array' });
        client.close();
        expect(server.getSnapshot().logs).toBeUndefined();
    });

    it('ignores packets with unknown types', async () => {
        const client = await connectClient(TEST_PORT);
        await sendAndWait(client, { batchId: 12, packets: [{ type: 'UNKNOWN_MAGIC' }] });
        client.close();
        expect(server.getSnapshot().buses).toBeUndefined();
    });

    it('rejects start() when the port is already in use', async () => {
        const duplicate = new WebSocketTelemetryServer(TEST_PORT);
        await expect(duplicate.start()).rejects.toThrow();
    });
});
