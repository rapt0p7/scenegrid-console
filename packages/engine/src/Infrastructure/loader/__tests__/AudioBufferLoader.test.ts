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
    let onEmergencyEviction: (url: string) => void;

    beforeEach(() => {
        vi.clearAllMocks();

        fakeAudioBuffer = { duration: 2.5, isDummy: false };
        dummyAudioBuffer = { duration: 0.0001, isDummy: true };
        // oxlint-disable-next-line typescript/strict-void-return
        onEmergencyEviction = vi.fn();

        mockContextManager = {
            context: {
                sampleRate: 44_100,
                decodeAudioData: vi.fn().mockResolvedValue(fakeAudioBuffer),
                createBuffer: vi.fn().mockReturnValue(dummyAudioBuffer)
            }
        };

        loader = new AudioBufferLoader(mockContextManager, 6, 1024, 10, onEmergencyEviction);

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
            if (tagName === 'audio') return mockAudioElement;
            return {} as any;
        });

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('Basic Loading & DTO Handling', () => {
        it('should fetch, decode, and return an AudioBuffer for a valid Request DTO', async () => {
            const buffer = await loader.load({ url: 'sound.mp3', priority: 'low', expectedSizeMb: 2 });

            expect(mockFetch).toHaveBeenCalledWith('sound.mp3');
            expect(mockContextManager.context.decodeAudioData).toHaveBeenCalled();
            expect(buffer).toBe(fakeAudioBuffer);
        });

        it('should skip URLs with no extension and continue resolution', async () => {
            mockAudioElement.canPlayType.mockImplementation((mime: string) => {
                if (mime === 'audio/mpeg') return 'probably';
                return '';
            });

            await loader.load({ url: ['my-sound', 'sound.mp3'], priority: 'low', expectedSizeMb: 2 });

            expect(mockFetch).toHaveBeenCalledWith('sound.mp3');
        });
    });

    describe('RAM Quota Manager & LRU Eviction', () => {
        it('should proactively evict the oldest LOW priority buffer when quota is exceeded', async () => {
            await loader.load({ url: 'low1.mp3', priority: 'low', expectedSizeMb: 4 });
            await loader.load({ url: 'low2.mp3', priority: 'low', expectedSizeMb: 4 });

            expect(loader.getBuffer('low1.mp3')).toBe(fakeAudioBuffer);
            expect(loader.getBuffer('low2.mp3')).toBe(fakeAudioBuffer);

            await loader.load({ url: 'low3.mp3', priority: 'low', expectedSizeMb: 4 });

            expect(loader.getBuffer('low1.mp3')).toBeUndefined();
            expect(loader.getBuffer('low2.mp3')).toBe(fakeAudioBuffer);
            expect(loader.getBuffer('low3.mp3')).toBe(fakeAudioBuffer);

            expect(onEmergencyEviction).not.toHaveBeenCalled();
        });

        it('should protect HIGH priority buffers and evict newer LOW buffers instead', async () => {
            await loader.load({ url: 'high1.mp3', priority: 'high', expectedSizeMb: 4 });
            await loader.load({ url: 'low1.mp3', priority: 'low', expectedSizeMb: 4 });

            await loader.load({ url: 'high2.mp3', priority: 'high', expectedSizeMb: 4 });

            expect(loader.getBuffer('high1.mp3')).toBe(fakeAudioBuffer);
            expect(loader.getBuffer('low1.mp3')).toBeUndefined();
            expect(loader.getBuffer('high2.mp3')).toBe(fakeAudioBuffer);
        });

        it('should trigger EMERGENCY eviction and callback if all LOW buffers are gone', async () => {
            await loader.load({ url: 'high1.mp3', priority: 'high', expectedSizeMb: 4 });
            await loader.load({ url: 'high2.mp3', priority: 'high', expectedSizeMb: 4 });

            await loader.load({ url: 'high3.mp3', priority: 'high', expectedSizeMb: 4 });

            expect(loader.getBuffer('high1.mp3')).toBeUndefined();
            expect(onEmergencyEviction).toHaveBeenCalledTimes(1);
            expect(onEmergencyEviction).toHaveBeenCalledWith('high1.mp3');
        });

        it('should update LRU status to MRU (head) when getBuffer is called', async () => {
            await loader.load({ url: 'low1.mp3', priority: 'low', expectedSizeMb: 4 });
            await loader.load({ url: 'low2.mp3', priority: 'low', expectedSizeMb: 4 });

            loader.getBuffer('low1.mp3');

            await loader.load({ url: 'low3.mp3', priority: 'low', expectedSizeMb: 4 });

            expect(loader.getBuffer('low2.mp3')).toBeUndefined();
            expect(loader.getBuffer('low1.mp3')).toBe(fakeAudioBuffer);
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
                sound1: { url: 'sound1.mp3', priority: 'low' as const, expectedSizeMb: 1 },
                sound2: { url: 'sound2.mp3', priority: 'high' as const, expectedSizeMb: 2 }
            };

            const results = await loader.loadBatch(resources);

            expect(mockFetch).toHaveBeenCalledTimes(2);
            expect(results).toHaveProperty('sound1', fakeAudioBuffer);
            expect(results).toHaveProperty('sound2', fakeAudioBuffer);
        });

        it('should call onProgress callback on successful loads', async () => {
            const resources = {
                sound1: { url: 'sound1.mp3', priority: 'low' as const, expectedSizeMb: 1 },
                sound2: { url: 'sound2.mp3', priority: 'low' as const, expectedSizeMb: 1 }
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
                good: { url: 'good.mp3', priority: 'low' as const, expectedSizeMb: 1 },
                bad: { url: 'fail.mp3', priority: 'low' as const, expectedSizeMb: 1 }
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

            const resources = { bad: { url: 'fail.mp3', priority: 'low' as const, expectedSizeMb: 1 } };
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

            await loader.load({ url: ['sound.ogg', 'sound.mp3'], priority: 'low', expectedSizeMb: 1 });

            expect(mockFetch).toHaveBeenCalledWith('sound.mp3');
        });

        it('should fallback to the first URL if no formats are explicitly supported', async () => {
            mockAudioElement.canPlayType.mockReturnValue('');

            await loader.load({ url: ['sound.ogg', 'sound.mp3'], priority: 'low', expectedSizeMb: 1 });

            expect(mockFetch).toHaveBeenCalledWith('sound.ogg');
        });

        it('should skip URLs with unknown extensions during resolution', async () => {
            mockAudioElement.canPlayType.mockReturnValue('probably');

            await loader.load({ url: ['sound.xyz', 'sound.wav'], priority: 'low', expectedSizeMb: 1 });

            expect(mockFetch).toHaveBeenCalledWith('sound.wav');
        });
    });

    describe('Caching & Deduplication', () => {
        it('should return cached buffer on subsequent calls without fetching again', async () => {
            const req = { url: 'sound.mp3', priority: 'low' as const, expectedSizeMb: 2 };
            await loader.load(req);
            expect(mockFetch).toHaveBeenCalledTimes(1);

            const buffer2 = await loader.load(req);

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

            const req = { url: 'heavy_sound.mp3', priority: 'low' as const, expectedSizeMb: 2 };
            const p1 = loader.load(req);
            const p2 = loader.load(req);

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
            const req = { url: 'sound.mp3', priority: 'low' as const, expectedSizeMb: 2 };
            await loader.load(req);
            loader.clearCache('sound.mp3');

            await loader.load(req);
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should clear entire cache if no url provided', async () => {
            await Promise.all([
                loader.load({ url: 'sound1.mp3', priority: 'low', expectedSizeMb: 1 }),
                loader.load({ url: 'sound2.mp3', priority: 'low', expectedSizeMb: 1 })
            ]);

            loader.clearCache();

            await loader.load({ url: 'sound1.mp3', priority: 'low', expectedSizeMb: 1 });
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });
    });

    describe('Error Handling (Silent Fallbacks)', () => {
        it('should return a Dummy Buffer and log a warning if network response is not ok', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            const buffer = await loader.load({ url: 'missing.mp3', priority: 'low', expectedSizeMb: 1 });

            expect(buffer).toBe(dummyAudioBuffer);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('missing.mp3'));
        });

        it('should return a Dummy Buffer and log an error if decoding fails', async () => {
            mockContextManager.context.decodeAudioData.mockRejectedValue(new Error('Decode error'));

            const buffer = await loader.load({ url: 'corrupt.mp3', priority: 'low', expectedSizeMb: 1 });

            expect(buffer).toBe(dummyAudioBuffer);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('corrupt.mp3'), expect.any(Error));
        });

        it('should remove failed requests from in-flight promises even on failure', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            await loader.load({ url: 'missing.mp3', priority: 'low', expectedSizeMb: 1 });

            const buffer = await loader.load({ url: 'missing.mp3', priority: 'low', expectedSizeMb: 1 });
            expect(buffer).toBe(dummyAudioBuffer);

            expect(mockFetch).toHaveBeenCalledTimes(1); // Кэш упавших не сохраняем
        });
    });

    describe('Buffer Access & Purging', () => {
        it('should return undefined from getBuffer if the resource is not cached', () => {
            const buffer = loader.getBuffer('uncached.mp3');
            expect(buffer).toBeUndefined();
        });

        it('should return cached buffer from getBuffer if previously loaded', async () => {
            await loader.load({ url: 'sound.mp3', priority: 'low', expectedSizeMb: 1 });
            const buffer = loader.getBuffer('sound.mp3');
            expect(buffer).toBe(fakeAudioBuffer);
        });

        it('should purge specific URLs from cache', async () => {
            await loader.load({ url: 's1.mp3', priority: 'low', expectedSizeMb: 1 });
            await loader.load({ url: 's2.mp3', priority: 'low', expectedSizeMb: 1 });

            loader.purgeUrls(['s1.mp3', 's2.mp3']);

            expect(loader.getBuffer('s1.mp3')).toBeUndefined();
            expect(loader.getBuffer('s2.mp3')).toBeUndefined();
        });
    });
});
