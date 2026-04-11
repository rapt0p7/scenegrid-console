// noinspection D

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AudioBufferLoader } from '@infrastructure/loader/AudioBufferLoader.js';

describe('AudioBufferLoader', () => {
    let mockContextManager: any;
    let loader: AudioBufferLoader;
    let mockFetch: any;
    let mockAudioElement: any;
    let fakeAudioBuffer: any;
    let dummyAudioBuffer: any;

    beforeEach(() => {
        vi.clearAllMocks();

        fakeAudioBuffer = { duration: 2.5, isDummy: false };
        dummyAudioBuffer = { duration: 0.0001, isDummy: true }; // Наш фейковый буфер тишины

        mockContextManager = {
            context: {
                sampleRate: 44_100,
                decodeAudioData: vi.fn().mockResolvedValue(fakeAudioBuffer),
                createBuffer: vi.fn().mockReturnValue(dummyAudioBuffer)
            }
        };

        loader = new AudioBufferLoader(mockContextManager);

        mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        });
        vi.stubGlobal('fetch', mockFetch);

        mockAudioElement = {
            canPlayType: vi.fn().mockReturnValue('probably')
        };
        vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            if (tagName === 'audio') return mockAudioElement as any;
            return {} as any;
        });

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('Basic Loading', () => {
        it('should fetch, decode, and return an AudioBuffer for a valid URL', async () => {
            const buffer = await loader.load('sound.mp3');

            expect(mockFetch).toHaveBeenCalledWith('sound.mp3');
            expect(mockContextManager.context.decodeAudioData).toHaveBeenCalled();
            expect(buffer).toBe(fakeAudioBuffer);
        });
    });

    describe('Batch Loading (loadBatch)', () => {
        it('should return an empty object if resources record is empty', async () => {
            const results = await loader.loadBatch({});

            expect(results).toEqual({});
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should load multiple valid resources and return a record of AudioBuffers', async () => {
            const resources = {
                sound1: 'sound1.mp3',
                sound2: 'sound2.mp3'
            };

            const results = await loader.loadBatch(resources);

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(results).toHaveProperty('sound1', fakeAudioBuffer);
            expect(results).toHaveProperty('sound2', fakeAudioBuffer);
        });

        it('should call onProgress callback on successful loads', async () => {
            const resources = {
                sound1: 'sound1.mp3',
                sound2: 'sound2.mp3'
            };
            const onProgress = vi.fn();

            await loader.loadBatch(resources, onProgress);

            expect(onProgress).toHaveBeenCalledTimes(2);
            expect(onProgress).toHaveBeenCalledWith(expect.any(Number), 2, expect.any(String));
        });

        it('should handle network failures gracefully by resolving with a dummy buffer', async () => {
            mockFetch.mockImplementation((url: string) => {
                if (url === 'fail.mp3') {
                    return Promise.resolve({ ok: false, status: 404 });
                }
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
                });
            });

            const resources = {
                good: 'good.mp3',
                bad: 'fail.mp3'
            };

            const onProgress = vi.fn();

            const results = await loader.loadBatch(resources, onProgress);

            expect(results).toHaveProperty('good', fakeAudioBuffer);
            expect(results).toHaveProperty('bad', dummyAudioBuffer);

            expect(onProgress).toHaveBeenCalledTimes(2);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('fail.mp3'));
        });

        it('should call onError only if a catastrophic unexpected error occurs', async () => {
            vi.spyOn(loader, 'load').mockRejectedValueOnce(new Error('Catastrophic failure'));

            const resources = { bad: 'fail.mp3' };
            const onProgress = vi.fn();
            const onError = vi.fn();

            await loader.loadBatch(resources, onProgress, onError);

            expect(onError).toHaveBeenCalledTimes(1);
            expect(onError).toHaveBeenCalledWith('bad', expect.any(Error));
            expect(onProgress).toHaveBeenCalledTimes(1);
        });
    });

    describe('Format Resolution (Fallbacks)', () => {
        it('should resolve the first supported format from an array', async () => {
            mockAudioElement.canPlayType.mockImplementation((mime: string) => {
                if (mime === 'audio/ogg') return '';
                if (mime === 'audio/mpeg') return 'probably';
                return '';
            });

            await loader.load(['sound.ogg', 'sound.mp3']);

            expect(mockFetch).toHaveBeenCalledWith('sound.mp3');
        });

        it('should fallback to the first URL if no formats are explicitly supported', async () => {
            mockAudioElement.canPlayType.mockReturnValue('');

            await loader.load(['sound.ogg', 'sound.mp3']);

            expect(mockFetch).toHaveBeenCalledWith('sound.ogg');
        });

        it('should skip URLs with unknown extensions during resolution', async () => {
            mockAudioElement.canPlayType.mockReturnValue('probably');

            await loader.load(['sound.xyz', 'sound.wav']);

            expect(mockFetch).toHaveBeenCalledWith('sound.wav');
        });
    });

    describe('Caching & Deduplication', () => {
        it('should return cached buffer on subsequent calls without fetching again', async () => {
            await loader.load('sound.mp3');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            const buffer2 = await loader.load('sound.mp3');

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(buffer2).toBe(fakeAudioBuffer);
        });

        it('should deduplicate concurrent requests (In-Flight Promises)', async () => {
            let resolveFetch!: (value: any) => void;
            mockFetch.mockReturnValue(
                new Promise(resolve => {
                    resolveFetch = resolve;
                })
            );

            const p1 = loader.load('heavy_sound.mp3');
            const p2 = loader.load('heavy_sound.mp3');

            resolveFetch({
                ok: true,
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
            });

            const [b1, b2] = await Promise.all([p1, p2]);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(b1).toBe(fakeAudioBuffer);
            expect(b2).toBe(fakeAudioBuffer);
        });

        it('should clear specific url from cache', async () => {
            await loader.load('sound.mp3');
            loader.clearCache('sound.mp3');

            await loader.load('sound.mp3');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should clear entire cache if no url provided', async () => {
            await Promise.all([loader.load('sound1.mp3'), loader.load('sound2.mp3')]);

            loader.clearCache();

            await loader.load('sound1.mp3');
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });
    });

    describe('Error Handling (Silent Fallbacks)', () => {
        it('should return a Dummy Buffer and log a warning if network response is not ok', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            const buffer = await loader.load('missing.mp3');

            expect(buffer).toBe(dummyAudioBuffer);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('missing.mp3'));
        });

        it('should return a Dummy Buffer and log an error if decoding fails', async () => {
            mockContextManager.context.decodeAudioData.mockRejectedValue(new Error('Decode error'));

            const buffer = await loader.load('corrupt.mp3');

            expect(buffer).toBe(dummyAudioBuffer);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('corrupt.mp3'), expect.any(Error));
        });

        it('should remove failed requests from in-flight promises even on failure', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            await loader.load('missing.mp3');

            const buffer = await loader.load('missing.mp3');
            expect(buffer).toBe(dummyAudioBuffer);

            expect(mockFetch).toHaveBeenCalledTimes(1);
        });
    });
});
