import type { ITelemetryBatch } from '@scene-grid/shared';

import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

import { BrowserTelemetryTransport } from '../BrowserTelemetryTransport.js';

describe('BrowserTelemetryTransport', () => {
    describe('connection lifecycle', () => {
        it('should safely ignore send operations when no target window is connected', () => {
            const transport = new BrowserTelemetryTransport();
            const batch = createSampleBatch(['packet-1', 'packet-2'], 2);

            expect(() => {
                transport.send(batch);
                transport.sendManifest({ version: 1 });
            }).not.toThrow();
        });
    });

    describe('send', () => {
        it('should slice pre-allocated packet buffers to match the active batch size', () => {
            const { windowStub, sentMessages } = createStubWindow();
            const transport = new BrowserTelemetryTransport('audio-engine-telemetry');
            transport.connect(windowStub);

            const batch = createSampleBatch(['packet-1', 'packet-2', 'unused-3', 'unused-4'], 2);

            transport.send(batch);

            expect(sentMessages).toEqual([
                {
                    data: {
                        channel: 'audio-engine-telemetry',
                        payload: ['packet-1', 'packet-2']
                    },
                    targetOrigin: '*'
                }
            ]);
        });

        it('should send an empty payload when batch size is zero', () => {
            const { windowStub, sentMessages } = createStubWindow();
            const transport = new BrowserTelemetryTransport();
            transport.connect(windowStub);

            const batch = createSampleBatch(['stale-packet-1', 'stale-packet-2'], 0);

            transport.send(batch);

            expect(sentMessages).toEqual([
                {
                    data: {
                        channel: 'audio-engine-telemetry',
                        payload: []
                    },
                    targetOrigin: '*'
                }
            ]);
        });

        it('should route messages under the configured custom channelId', () => {
            const customChannel = 'custom-inspector-stream';
            const { windowStub, sentMessages } = createStubWindow();
            const transport = new BrowserTelemetryTransport(customChannel);
            transport.connect(windowStub);

            const batch = createSampleBatch(['packet-1'], 1);

            transport.send(batch);

            expect(sentMessages[0]?.data).toEqual({
                channel: customChannel,
                payload: ['packet-1']
            });
        });

        it('should always transmit packets sliced exactly to batch.size for arbitrary buffer configurations', () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1 }),
                    fc.array(fc.record({ id: fc.string(), value: fc.double() })),
                    fc.nat(),
                    (channelId, packets, size) => {
                        const { windowStub, sentMessages } = createStubWindow();
                        const transport = new BrowserTelemetryTransport(channelId);
                        transport.connect(windowStub);

                        const batch = {
                            packets,
                            size
                        } as unknown as ITelemetryBatch;

                        transport.send(batch);

                        expect(sentMessages).toHaveLength(1);
                        expect(sentMessages[0]).toEqual({
                            data: {
                                channel: channelId,
                                payload: packets.slice(0, size)
                            },
                            targetOrigin: '*'
                        });
                    }
                )
            );
        });
    });

    describe('sendManifest', () => {
        it('should format manifest payloads with the MANIFEST type and target origin', () => {
            const { windowStub, sentMessages } = createStubWindow();
            const transport = new BrowserTelemetryTransport('audio-engine-telemetry');
            transport.connect(windowStub);

            const manifest = {
                graphVersion: '2.0.1',
                activeVoices: 16
            };

            transport.sendManifest(manifest);

            expect(sentMessages).toEqual([
                {
                    data: {
                        channel: 'audio-engine-telemetry',
                        type: 'MANIFEST',
                        payload: manifest
                    },
                    targetOrigin: '*'
                }
            ]);
        });

        it('should preserve arbitrary manifest payload structures during transmission', () => {
            fc.assert(
                fc.property(fc.string({ minLength: 1 }), fc.jsonValue(), (channelId, manifestPayload) => {
                    const { windowStub, sentMessages } = createStubWindow();
                    const transport = new BrowserTelemetryTransport(channelId);
                    transport.connect(windowStub);

                    transport.sendManifest(manifestPayload);

                    expect(sentMessages).toEqual([
                        {
                            data: {
                                channel: channelId,
                                type: 'MANIFEST',
                                payload: manifestPayload
                            },
                            targetOrigin: '*'
                        }
                    ]);
                })
            );
        });
    });
});

interface SentWindowMessage {
    data: unknown;
    targetOrigin: string;
}

function createStubWindow(): { windowStub: Window; sentMessages: SentWindowMessage[] } {
    const sentMessages: SentWindowMessage[] = [];

    const windowStub = {
        postMessage: (data: unknown, targetOrigin: string) => {
            sentMessages.push({ data, targetOrigin });
        }
    } as unknown as Window;

    return { windowStub, sentMessages };
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters
function createSampleBatch<T>(packets: T[], size: number): ITelemetryBatch {
    return {
        packets,
        size
    } as unknown as ITelemetryBatch;
}
