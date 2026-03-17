import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AudioBufferLoader } from '@webaudio-core';

describe('AudioBufferLoader', () => {
    let mockContextManager: any;
    let loader: AudioBufferLoader;
    let mockFetch: any;
    let mockAudioElement: any;
    let fakeAudioBuffer: any;

    beforeEach(() => {
        vi.clearAllMocks();

        fakeAudioBuffer = { duration: 2.5 };

        mockContextManager = {
            context: {
                decodeAudioData: vi.fn().mockResolvedValue(fakeAudioBuffer)
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

    describe('Error Handling', () => {
        it('should throw an error if network response is not ok', async () => {
            mockFetch.mockResolvedValue({ ok: false, status: 404 });

            await expect(loader.load('missing.mp3')).rejects.toThrow(
                'AudioBufferLoader: failed to load or decode missing.mp3'
            );
        });

        it('should throw an error if decoding fails and remove from in-flight', async () => {
            mockContextManager.context.decodeAudioData.mockRejectedValue(new Error('Decode error'));

            await expect(loader.load('corrupt.mp3')).rejects.toThrow(
                'AudioBufferLoader: failed to load or decode corrupt.mp3'
            );

            mockContextManager.context.decodeAudioData.mockResolvedValue(fakeAudioBuffer);
            await loader.load('corrupt.mp3');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });
});
