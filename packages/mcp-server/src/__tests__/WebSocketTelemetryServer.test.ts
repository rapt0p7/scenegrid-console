import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
// oxlint-disable-next-line import/no-named-as-default
import WebSocket from 'ws';

import { WebSocketTelemetryServer } from '../WebSocketTelemetryServer.js';

describe('WebSocketTelemetryServer', () => {
    let server: WebSocketTelemetryServer;
    const testPort = 8089;

    beforeAll(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    beforeEach(async () => {
        server = new WebSocketTelemetryServer(testPort);
        await server.start();
    });

    afterEach(async () => {
        await server.stop();
    });

    it('should open a port and parse incoming telemetry JSON into memory', () => {
        return new Promise<void>((resolve, reject) => {
            const client = new WebSocket(`ws://localhost:${testPort}`);

            client.on('open', () => {
                const telemetryPayload = {
                    batchId: 1,
                    packets: [
                        {
                            type: 'SNAPSHOT',
                            activePlaybacks: [{ id: 'pb_1', state: 'playing' }]
                        }
                    ]
                };
                client.send(JSON.stringify(telemetryPayload));

                setTimeout(() => {
                    try {
                        const snapshot = server.getSnapshot();
                        expect(snapshot.activePlaybacks).toEqual([{ id: 'pb_1', state: 'playing' }]);
                        client.close();
                        resolve();
                    } catch (err) {
                        client.close();
                        reject(err);
                    }
                }, 50);
            });

            client.on('error', reject);
        });
    });
});
