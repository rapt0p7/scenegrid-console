import type { ITelemetryBatch } from '@scene-grid/shared';

import fc from 'fast-check';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { BroadcastIpcAdapter } from '../BroadcastIpcAdapter.js';
import { BroadcastTelemetryTransport } from '../BroadcastTelemetryTransport.js';

describe('BroadcastTelemetryTransport', () => {
    const TELEMETRY_CHANNEL_NAME = 'scenegrid_audio_telemetry';

    let transport: BroadcastTelemetryTransport;
    let receiver: BroadcastIpcAdapter<unknown>;

    beforeEach(() => {
        transport = new BroadcastTelemetryTransport();
        receiver = new BroadcastIpcAdapter<unknown>(TELEMETRY_CHANNEL_NAME);
    });

    afterEach(() => {
        transport?.dispose();
        receiver?.dispose();
    });

    describe('send', () => {
        it('should broadcast telemetry batches directly to subscribers on the telemetry channel', async () => {
            const receivedMessages: unknown[] = [];
            receiver.subscribe(msg => {
                receivedMessages.push(msg);
            });

            const batch = createSampleTelemetryBatch();

            transport.send(batch);
            await waitForMessageDelivery();

            expect(receivedMessages).toEqual([batch]);
        });
    });

    describe('sendManifest', () => {
        it('should envelope manifest data in a MANIFEST message structure before broadcasting', async () => {
            const receivedMessages: unknown[] = [];
            receiver.subscribe(msg => {
                receivedMessages.push(msg);
            });

            const manifestPayload = {
                version: '1.2.0',
                nodes: ['GainNode', 'AudioBufferSourceNode'],
                sampleRate: 48000
            };

            transport.sendManifest(manifestPayload);
            await waitForMessageDelivery();

            expect(receivedMessages).toEqual([
                {
                    type: 'MANIFEST',
                    payload: manifestPayload
                }
            ]);
        });

        it('should preserve arbitrary manifest payload structures across transmission', async () => {
            await fc.assert(
                fc.asyncProperty(fc.jsonValue(), async manifestPayload => {
                    let received;
                    const unsubscribe = receiver.subscribe(msg => {
                        received = msg;
                    });

                    try {
                        transport.sendManifest(manifestPayload);
                        await waitForMessageDelivery();

                        expect(received).toEqual({
                            type: 'MANIFEST',
                            payload: manifestPayload
                        });
                    } finally {
                        unsubscribe();
                    }
                })
            );
        });
    });

    describe('dispose', () => {
        it('should cease message delivery after the transport is disposed', async () => {
            const receivedMessages: unknown[] = [];
            receiver.subscribe(msg => {
                receivedMessages.push(msg);
            });

            transport.dispose();

            try {
                transport.send(createSampleTelemetryBatch());
            } catch {}
            await waitForMessageDelivery();

            expect(receivedMessages).toEqual([]);
        });
    });
});

function createSampleTelemetryBatch(): ITelemetryBatch {
    return {
        timestamp: Date.now(),
        sessionId: 'session_audio_01',
        metrics: [
            { name: 'dsp_latency_ms', value: 3.4 },
            { name: 'buffer_underruns', value: 0 }
        ]
    } as unknown as ITelemetryBatch;
}

function waitForMessageDelivery(delayMs = 10): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, delayMs));
}
