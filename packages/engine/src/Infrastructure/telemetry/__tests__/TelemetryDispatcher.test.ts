import type { ITelemetryBatch, ITelemetryTransport, TelemetryPacket } from '@scene-grid/shared';

import { TelemetryDispatcher } from '@infrastructure/telemetry/TelemetryDispatcher.js';
import { WorkerTelemetryTransport } from '@infrastructure/telemetry/WorkerTelemetryTransport.js';
// oxlint-disable typescript/strict-void-return
// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Telemetry Observability Pipeline', () => {
    describe('WorkerTelemetryTransport', () => {
        let mockPort: MessagePort;

        beforeEach(() => {
            mockPort = {
                postMessage: vi.fn(),
                start: vi.fn()
            } as unknown as MessagePort;
        });

        it('should call start() on the port upon instantiation', () => {
            new WorkerTelemetryTransport(mockPort);
            expect(mockPort.start).toHaveBeenCalledTimes(1);
        });

        it('should send batch payload via postMessage', () => {
            const transport = new WorkerTelemetryTransport(mockPort);
            const dummyBatch: ITelemetryBatch = {
                batchId: 10,
                size: 2,
                packets: ['packet1', 'packet2'] as unknown as TelemetryPacket[]
            };

            transport.send(dummyBatch);

            expect(mockPort.postMessage).toHaveBeenCalledTimes(1);
            expect(mockPort.postMessage).toHaveBeenCalledWith(dummyBatch);
        });

        it('should send manifest wrapper via postMessage', () => {
            const transport = new WorkerTelemetryTransport(mockPort);
            const dummyManifest = { version: '1.0', nodes: 5 };

            transport.sendManifest(dummyManifest);

            expect(mockPort.postMessage).toHaveBeenCalledWith({
                type: 'MANIFEST',
                payload: dummyManifest
            });
        });
    });

    describe('TelemetryDispatcher', () => {
        let mockTransport: { send: ReturnType<typeof vi.fn>; sendManifest: ReturnType<typeof vi.fn> };
        let dispatcher: TelemetryDispatcher;

        const dummyPacket: TelemetryPacket = {
            type: 'LIFECYCLE',
            action: 'START',
            timestampMs: 1000,
            playbackId: 42 as any,
            soundId: 'bgm' as any
        };

        beforeEach(() => {
            mockTransport = { send: vi.fn(), sendManifest: vi.fn() };
            dispatcher = new TelemetryDispatcher(mockTransport as unknown as ITelemetryTransport, 3);
            vi.spyOn(console, 'warn').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should safely ignore dispatch and tick if no transport is provided (early returns)', () => {
            const noTransportDispatcher = new TelemetryDispatcher(null, 10);

            expect(() => {
                noTransportDispatcher.dispatch(dummyPacket);
                noTransportDispatcher.tick(0, 16);
            }).not.toThrow();
        });

        it('should ignore tick if packetCount is 0', () => {
            dispatcher.tick(0, 16);
            expect(mockTransport.send).not.toHaveBeenCalled();
        });

        it('should accumulate packets and flush on tick', () => {
            let capturedSize = 0;
            mockTransport.send.mockImplementationOnce((batch: ITelemetryBatch) => {
                capturedSize = batch.size;
            });

            dispatcher.dispatch(dummyPacket);
            dispatcher.dispatch(dummyPacket);

            expect(mockTransport.send).not.toHaveBeenCalled();

            dispatcher.tick(0, 16);

            expect(mockTransport.send).toHaveBeenCalledTimes(1);
            expect(capturedSize).toBe(2);
        });

        it('should auto-flush when maxPacketsPerBatch is reached', () => {
            dispatcher.dispatch(dummyPacket);
            dispatcher.dispatch(dummyPacket);
            expect(mockTransport.send).not.toHaveBeenCalled();

            dispatcher.dispatch(dummyPacket);

            expect(mockTransport.send).toHaveBeenCalledTimes(1);

            const batch = mockTransport.send.mock.calls[0][0] as ITelemetryBatch;
            expect(batch.batchId).toBe(1);
            expect(batch.size).toBe(3);
        });

        it('should reset packet count after flush and increment batchId correctly', () => {
            let capturedId1 = 0;
            mockTransport.send.mockImplementationOnce(batch => {
                capturedId1 = batch.batchId;
            });
            dispatcher.dispatch(dummyPacket);
            dispatcher.tick(0, 16);

            let capturedId2 = 0;
            let capturedSize2 = 0;
            mockTransport.send.mockImplementationOnce(batch => {
                capturedId2 = batch.batchId;
                capturedSize2 = batch.size;
            });
            dispatcher.dispatch(dummyPacket);
            dispatcher.dispatch(dummyPacket);
            dispatcher.tick(0, 16);

            expect(capturedId1).toBe(1);
            expect(capturedId2).toBe(2);
            expect(capturedSize2).toBe(2);
        });

        it('should handle transport send errors gracefully, log warning, and still reset packet count', () => {
            const error = new Error('Transport Failure');
            mockTransport.send.mockImplementationOnce(() => {
                throw error;
            });

            dispatcher.dispatch(dummyPacket);
            dispatcher.tick(0, 16);

            expect(console.warn).toHaveBeenCalledWith('[TelemetryDispatcher] Failed to send telemetry batch:', error);

            let capturedSize = 0;
            mockTransport.send.mockImplementationOnce(batch => {
                capturedSize = batch.size;
            });

            dispatcher.dispatch(dummyPacket);
            dispatcher.tick(0, 16);

            expect(capturedSize).toBe(1);
        });

        it('should forward manifest to the transport', () => {
            const dummyManifest = { test: true };
            dispatcher.dispatchManifest(dummyManifest);
            expect(mockTransport.sendManifest).toHaveBeenCalledWith(dummyManifest);
        });
    });
});
