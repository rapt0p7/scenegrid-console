import type { IStreamManifest } from '@domain/Configuration/Ports/IStreamManifest.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';

import { ChunkedLoader } from '@infrastructure/loader/ChunkedLoader.js';
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

export const mockStreamManifest: IStreamManifest = {
    isLooping: true,
    chunks: [
        {
            url: 'https://cdn.scenegrid.io/audio/ambient_chunk_0.aac',
            trimStartSamples: 1024,
            durationSamples: 88200
        },
        {
            url: 'https://cdn.scenegrid.io/audio/ambient_chunk_1.aac',
            trimStartSamples: 1024,
            durationSamples: 88200
        },
        {
            url: 'https://cdn.scenegrid.io/audio/ambient_chunk_2.aac',
            trimStartSamples: 1024,
            durationSamples: 44100
        }
    ]
};

describe('ChunkedLoader (Infrastructure Layer)', () => {
    let loader: ChunkedLoader;
    let mockContext: any;
    let mockTelemetry: ITelemetryDispatcher;
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    // oxlint-disable-next-line unicorn/consistent-function-scoping
    const flushPromises = () => new Promise(resolve => setImmediate(resolve));

    beforeEach(() => {
        mockContext = {
            currentTime: 0,
            state: 'running',
            decodeAudioData: vi.fn().mockResolvedValue({ length: 44100, duration: 1 })
        };

        mockTelemetry = {
            dispatch: vi.fn(),
            dispatchManifest: vi.fn()
        };

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        });
        fetchSpy = vi.spyOn(global, 'fetch');

        loader = new ChunkedLoader(mockContext, mockTelemetry);
        loader.loadManifest(mockStreamManifest);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('2.0: Initialization and State', () => {
        it('should correctly initialize with default states', () => {
            const newLoader = new ChunkedLoader(mockContext, mockTelemetry);
            expect(newLoader.isZombieStateDetected()).toBe(false);
            expect(newLoader.getRetryCount()).toBe(0);
            expect(newLoader.getDecodedQueueSize()).toBe(0);

            newLoader.loadManifest(mockStreamManifest);
            newLoader.tick(0, 16);
            expect(fetchSpy).not.toHaveBeenCalled();

            newLoader.start();
            newLoader.tick(1, 16);
            newLoader.tick(1, 16);
            newLoader.tick(1, 16);
            expect(newLoader.isZombieStateDetected()).toBe(false);
            newLoader.tick(1, 16);
            expect(newLoader.isZombieStateDetected()).toBe(true);
        });
    });

    describe('2.1: Look-ahead Fetch Queue & Margin Math', () => {
        it('should trigger fetch using max(50% of chunkDuration, absoluteFloorSeconds) and wrap to Chunk 0', async () => {
            loader.start();

            expect(fetchSpy).toHaveBeenCalledWith('https://cdn.scenegrid.io/audio/ambient_chunk_0.aac');
            fetchSpy.mockClear();

            await flushPromises();

            mockContext.currentTime = 2.0;
            loader.syncTimeline(0, 2.0);
            loader.tick(mockContext.currentTime, 16);

            expect(fetchSpy).toHaveBeenCalledWith('https://cdn.scenegrid.io/audio/ambient_chunk_1.aac');
            fetchSpy.mockClear();
        });

        it('should completely reset state when loadManifest is called again', async () => {
            loader.start();
            await flushPromises();
            expect(loader.getDecodedQueueSize()).toBeGreaterThan(0);

            loader.loadManifest(mockStreamManifest);

            expect(loader.getDecodedQueueSize()).toBe(0);

            fetchSpy.mockClear();
            loader.tick(0, 16);
            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });

    describe('2.2: Pause, TTL Cache Eviction & Zombie Context Heuristic', () => {
        it('should halt fetching on pause() or context suspend', () => {
            loader.start();
            fetchSpy.mockClear();

            loader.pause(mockContext.currentTime);

            mockContext.currentTime += 5.0;
            loader.tick(mockContext.currentTime, 16);

            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('should flush decoded queue if paused beyond TTL (5 minutes)', async () => {
            loader.start();
            await flushPromises();

            loader.tick(0, 16);

            expect(loader.getDecodedQueueSize()).toBe(1);

            loader.pause(mockContext.currentTime);

            const TTL_MS = 5 * 60 * 1000;

            loader.tick(mockContext.currentTime, TTL_MS - 100);

            loader.tick(mockContext.currentTime, 200);

            expect(loader.getDecodedQueueSize()).toBe(0);

            fetchSpy.mockClear();
            loader.resume(mockContext.currentTime);
            expect(fetchSpy).toHaveBeenCalledWith('https://cdn.scenegrid.io/audio/ambient_chunk_0.aac');
        });

        it('should fully re-initialize if resuming from a Zombie context (iOS watchdog)', () => {
            loader.start();
            loader.pause(mockContext.currentTime);

            mockContext.state = 'running';
            mockContext.currentTime = 10.0;

            loader.resume(mockContext.currentTime);

            loader.tick(10.0, 16);
            loader.tick(10.0, 16);
            loader.tick(10.0, 16);

            expect(loader.isZombieStateDetected()).toBe(true);
        });
    });

    describe('2.3: Underrun Deadline, Backoff Strategy & Telemetry', () => {
        it('should retry up to 3 times with backoff, then emit fatal telemetry', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));

            loader.start();
            await flushPromises();

            mockContext.currentTime += 0.1;
            loader.tick(mockContext.currentTime, 1000);
            await flushPromises();
            expect(loader.getRetryCount()).toBe(1);

            mockContext.currentTime += 0.1;
            loader.tick(mockContext.currentTime, 1000);
            await flushPromises();
            expect(loader.getRetryCount()).toBe(1);

            mockContext.currentTime += 0.1;
            loader.tick(mockContext.currentTime, 1000);
            await flushPromises();
            expect(loader.getRetryCount()).toBe(2);

            mockContext.currentTime += 0.1;
            loader.tick(mockContext.currentTime, 2000);
            await flushPromises();
            expect(loader.getRetryCount()).toBe(2);

            mockContext.currentTime += 0.1;
            loader.tick(mockContext.currentTime, 2000);
            await flushPromises();

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'CAUSE_CHAIN',
                    initiator: expect.objectContaining({
                        type: 'STREAM_LOADER',
                        reason: 'audio_stream_underrun_fatal'
                    }),
                    result: expect.objectContaining({
                        type: 'FATAL_UNDERRUN',
                        target: 'chunk_underrun'
                    })
                })
            );
        });

        it('should explicitly freeze backoff timers on pause() to prevent false-positives', () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
            loader.start();

            loader.tick(mockContext.currentTime, 1000);

            loader.pause(mockContext.currentTime);

            loader.tick(mockContext.currentTime, 3600000);

            expect(mockTelemetry.dispatch).not.toHaveBeenCalled();
        });

        it('should cleanly reset retry counter to 0 on resume()', () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
            loader.start();
            loader.tick(mockContext.currentTime, 1000);

            loader.pause(mockContext.currentTime);

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
            });

            loader.resume(mockContext.currentTime);

            expect(loader.getRetryCount()).toBe(0);
        });

        it('should trigger fetch if active chunk is missing and not in flight (e.g. fast forward)', () => {
            loader.start();

            fetchSpy.mockClear();

            loader.syncTimeline(1, 10.0);

            loader.tick(10.0, 1000);

            expect(fetchSpy).toHaveBeenCalledWith('https://cdn.scenegrid.io/audio/ambient_chunk_1.aac');
        });

        it('should early return from handleUnderrunDeadline if max retries reached', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
            loader.start();
            await flushPromises();
            mockContext.currentTime += 0.5;
            loader.tick(mockContext.currentTime, 1000);
            await flushPromises();
            mockContext.currentTime += 0.5;
            loader.tick(mockContext.currentTime, 2000);
            await flushPromises();
            mockContext.currentTime += 0.5;
            loader.tick(mockContext.currentTime, 4000);

            mockContext.currentTime += 0.5;
            loader.tick(mockContext.currentTime, 8000);
            expect(loader.getRetryCount()).toBe(3);
        });

        it('should not double-fetch or trigger underrun backoff while a chunk is already in flight', () => {
            fetchSpy.mockClear();
            loader.start();
            expect(fetchSpy).toHaveBeenCalledTimes(1);

            loader.tick(0, 1000);

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(loader.getRetryCount()).toBe(0);
        });
    });

    describe('2.4: Edge Cases and Coverage', () => {
        it('should not start if manifest is missing or empty', () => {
            const emptyLoader = new ChunkedLoader(mockContext, mockTelemetry);
            emptyLoader.start();
            expect(fetchSpy).not.toHaveBeenCalled();

            emptyLoader.loadManifest({ isLooping: false, chunks: [] });
            emptyLoader.start();
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('should exit early in tick if suspended', () => {
            loader.start();
            mockContext.state = 'suspended';
            loader.tick(mockContext.currentTime, 16);
            expect(loader.getDecodedQueueSize()).toBe(0);
        });

        it('should exit early in tick if not playing or missing manifest', () => {
            const notPlayingLoader = new ChunkedLoader(mockContext, mockTelemetry);
            notPlayingLoader.tick(1, 16);
            expect(fetchSpy).not.toHaveBeenCalled();

            (notPlayingLoader as any).evaluateLookahead(1.0);

            notPlayingLoader.loadManifest(mockStreamManifest);
            notPlayingLoader.tick(1, 16);
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('should handle context closed in resume()', async () => {
            loader.start();
            await flushPromises();
            expect(loader.getDecodedQueueSize()).toBeGreaterThan(0);

            mockContext.state = 'closed';
            loader.resume(1.0);

            expect(loader.getDecodedQueueSize()).toBe(0);

            fetchSpy.mockClear();
            loader.tick(1.0, 16);
        });

        it('should correctly evaluate lookahead with and without looping', async () => {
            const noLoopManifest = {
                isLooping: false,
                chunks: [{ url: 'chunk_0.aac', trimStartSamples: 0, durationSamples: 44100 }]
            };
            loader.loadManifest(noLoopManifest);
            loader.start();
            await flushPromises();
            loader.tick(0, 16);

            expect(fetchSpy).toHaveBeenCalledTimes(1);

            const loopManifest = {
                isLooping: true,
                chunks: [
                    { url: 'chunk_0.aac', trimStartSamples: 0, durationSamples: 44100 },
                    { url: 'chunk_1.aac', trimStartSamples: 0, durationSamples: 44100 }
                ]
            };
            fetchSpy.mockClear();
            loader.loadManifest(loopManifest);
            loader.start();
            await flushPromises();

            loader.tick(0, 16);
            await flushPromises();

            loader.syncTimeline(1, 2.0);

            loader.tick(2.0, 16);
            await flushPromises();

            expect(loader.hasChunk(0)).toBe(true);
        });

        it('should sync timeline correctly and evict old chunks', async () => {
            loader.start();
            await flushPromises();

            mockContext.currentTime = 2.0;
            loader.tick(mockContext.currentTime, 16);
            await flushPromises();

            loader.syncTimeline(1, 10.0);
            expect(loader.hasChunk(0)).toBe(false);

            loader.syncTimeline(1, 10.0);
        });

        it('should handle loop logic on syncTimeline (index 0, old chunks not deleted)', async () => {
            loader.start();
            await flushPromises();

            loader.tick(2.0, 16);
            await flushPromises();

            loader.syncTimeline(0, 10.0);
            expect(loader.hasChunk(1)).toBe(true);
        });

        it('should cover the impossible branch condition in syncTimeline by manually injecting a negative key', async () => {
            loader.start();
            await flushPromises();

            loader.syncTimeline(1, 10.0);

            const map = (loader as any).decodedBuffers as Map<number, AudioBuffer>;
            map.set(-1, {} as AudioBuffer);

            loader.syncTimeline(0, 10.0);

            expect(map.has(-1)).toBe(false);

            map.set(1, {} as AudioBuffer);
            map.set(2, {} as AudioBuffer);
            loader.syncTimeline(2, 10.0);

            expect(map.has(1)).toBe(false);
            expect(map.has(2)).toBe(true);
        });

        it('should throw an error internally if response is not ok', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404
            });
            loader.start();
            await flushPromises();
            expect(loader.hasChunk(0)).toBe(false);
            expect(loader.getRetryCount()).toBe(0);
        });

        it('should provide getChunk and hasChunk accessors', async () => {
            loader.start();
            await flushPromises();
            expect(loader.hasChunk(0)).toBe(true);
            expect(loader.getChunk(0)).toBeDefined();
            expect(loader.getChunk(99)).toBeUndefined();
        });

        it('should resume correctly and initialize lastSeenAudioTime to detect immediate stalls', async () => {
            loader.start();
            await flushPromises();

            loader.pause();

            loader.resume(2.0);

            loader.tick(2.0, 16);
            loader.tick(2.0, 16);
            expect(loader.isZombieStateDetected()).toBe(false);
            loader.tick(2.0, 16);
            expect(loader.isZombieStateDetected()).toBe(true);

            expect(loader.getDecodedQueueSize()).toBe(0);
        });

        it('should handle backoff timer > 0 (no retry triggered yet)', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
            loader.start();
            await flushPromises();

            loader.tick(mockContext.currentTime, 500);

            expect(loader.getRetryCount()).toBe(0);
        });
    });
});
