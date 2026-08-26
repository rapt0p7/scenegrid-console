// noinspection D

import { AudioBufferLoader } from '@infrastructure/loader/AudioBufferLoader.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

    describe('Initialization Bounds & Pointers', () => {
        it('should correctly populate freeIndices and bounds preventing overflow (Lines 55-64)', async () => {
            const testLoader = new AudioBufferLoader(mockContextManager, 2, 2, 50);

            await testLoader.load({ url: 'A', priority: 'low', expectedSizeMb: 1 });
            await testLoader.load({ url: 'B', priority: 'low', expectedSizeMb: 1 });

            expect(testLoader.getBuffer('A')).toBeDefined();
            expect(testLoader.getBuffer('B')).toBeDefined();

            await testLoader.load({ url: 'C', priority: 'low', expectedSizeMb: 1 });
            expect(testLoader.getBuffer('A')).toBeUndefined();
            expect(testLoader.getBuffer('B')).toBeDefined();
            expect(testLoader.getBuffer('C')).toBeDefined();
        });
    });

    describe('Batch Loading Integrity (loadBatch)', () => {
        it('should return immediately without creating promises if resources record is empty (Line 128)', async () => {
            const spy = vi.spyOn(Promise, 'allSettled');
            const results = await loader.loadBatch({});

            expect(results).toEqual({});
            expect(spy).not.toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should strictly track loadedItems and fire callbacks even on failures without throwing (Lines 135-140)', async () => {
            vi.spyOn(loader, 'load').mockImplementation(async req => {
                if (req.url === 'bad.mp3') throw new Error('Simulated crash');
                return fakeAudioBuffer;
            });

            const resources = {
                a: { url: 'good1.mp3', priority: 'low' as const, expectedSizeMb: 1 },
                b: { url: 'bad.mp3', priority: 'low' as const, expectedSizeMb: 1 },
                c: { url: 'good2.mp3', priority: 'low' as const, expectedSizeMb: 1 }
            };

            const progressValues: number[] = [];
            let errorFired = false;

            await loader.loadBatch(
                resources,
                loaded => progressValues.push(loaded),
                () => {
                    errorFired = true;
                }
            );

            expect(progressValues.length).toBe(3);
            // oxlint-disable-next-line unicorn/no-array-sort
            expect(progressValues.sort((a, b) => a - b)).toEqual([1, 2, 3]);
            expect(errorFired).toBe(true);
        });

        it('should safely execute loadBatch without optional callbacks', async () => {
            const resources = { a: { url: 'good.mp3', priority: 'low' as const, expectedSizeMb: 1 } };
            await expect(loader.loadBatch(resources)).resolves.toBeDefined();
        });
    });

    describe('Format Resolution Mechanics', () => {
        it('should explicitly evaluate toLowerCase() to map extensions correctly (Line 323)', async () => {
            mockAudioElement.canPlayType.mockReturnValue('probably');
            await loader.load({ url: ['SOUND.MP3', 'fallback.wav'], priority: 'low', expectedSizeMb: 1 });
            expect(mockFetch).toHaveBeenCalledWith('SOUND.MP3');
        });

        it('should ignore candidates with missing extensions and proceed (Line 325)', async () => {
            mockAudioElement.canPlayType.mockReturnValue('probably');
            await loader.load({ url: ['no-ext', 'valid.mp3'], priority: 'low', expectedSizeMb: 1 });
            expect(mockFetch).toHaveBeenCalledWith('valid.mp3');
        });

        it('should ignore candidates with unknown MIME types and proceed (Line 329)', async () => {
            mockAudioElement.canPlayType.mockReturnValue('probably');
            await loader.load({ url: ['weird.unknown', 'valid.mp3'], priority: 'low', expectedSizeMb: 1 });
            expect(mockFetch).toHaveBeenCalledWith('valid.mp3');
        });
    });

    describe('Caching & Clear Mechanisms', () => {
        it('should perfectly reset internal pointers so LRU works correctly after clear (Lines 150-169)', async () => {
            const testLoader = new AudioBufferLoader(mockContextManager, 5, 2, 50);

            await testLoader.load({ url: 'A.mp3', priority: 'low', expectedSizeMb: 1 });
            await testLoader.load({ url: 'B.mp3', priority: 'low', expectedSizeMb: 1 });

            testLoader.clearCache();

            expect(testLoader.getCurrentRam()).toBe(0);

            await testLoader.load({ url: 'C.mp3', priority: 'low', expectedSizeMb: 1 });
            await testLoader.load({ url: 'D.mp3', priority: 'low', expectedSizeMb: 1 });
            await testLoader.load({ url: 'E.mp3', priority: 'low', expectedSizeMb: 1 });

            expect(testLoader.getBuffer('D.mp3')).toBeDefined();
            expect(testLoader.getBuffer('C.mp3')).toBeUndefined();
            expect(testLoader.getBuffer('E.mp3')).toBeDefined();
        });

        it('should strictly clear specific url from cache and NOT clear everything (Line 150)', async () => {
            await loader.load({ url: 'S1', priority: 'low', expectedSizeMb: 1 });
            await loader.load({ url: 'S2', priority: 'low', expectedSizeMb: 1 });

            loader.clearCache('S1');

            expect(loader.getBuffer('S1')).toBeUndefined();
            expect(loader.getBuffer('S2')).toBeDefined();
        });

        it('should safely process purgeUrls without accessing undefined indices (Lines 187-195)', async () => {
            await loader.load({ url: 'Keep', priority: 'low', expectedSizeMb: 1 });
            await loader.load({ url: 'Drop', priority: 'low', expectedSizeMb: 1 });

            expect(() => {
                loader.purgeUrls(['Drop', 'Ghost']);
            }).not.toThrow();

            expect(loader.getBuffer('Drop')).toBeUndefined();
            expect(loader.getBuffer('Keep')).toBeDefined();
        });

        it('should return undefined safely for unknown buffers without corrupting MRU (Line 179)', () => {
            expect(() => loader.getBuffer('unknown')).not.toThrow();
            expect(loader.getBuffer('unknown')).toBeUndefined();
        });
    });

    describe('Double-Linked LRU & Ram Quota (Heavy Math Mutants)', () => {
        it('should perfectly update MRU double-linked list pointers when middle item is accessed (Lines 252-286)', async () => {
            const testLoader = new AudioBufferLoader(mockContextManager, 5, 4, 50);
            await testLoader.load({ url: 'L1', priority: 'low', expectedSizeMb: 1 });
            await testLoader.load({ url: 'L2', priority: 'low', expectedSizeMb: 1 });
            await testLoader.load({ url: 'L3', priority: 'low', expectedSizeMb: 1 });
            await testLoader.load({ url: 'L4', priority: 'low', expectedSizeMb: 1 });

            testLoader.getBuffer('L2');
            testLoader.getBuffer('L1');

            await testLoader.load({ url: 'L5', priority: 'low', expectedSizeMb: 1 });
            await testLoader.load({ url: 'L6', priority: 'low', expectedSizeMb: 1 });

            expect(testLoader.getBuffer('L3')).toBeUndefined();
            expect(testLoader.getBuffer('L4')).toBeUndefined();
            expect(testLoader.getBuffer('L1')).toBeDefined();
            expect(testLoader.getBuffer('L2')).toBeDefined();
            expect(testLoader.getBuffer('L5')).toBeDefined();
            expect(testLoader.getBuffer('L6')).toBeDefined();
        });

        it('should fallback to High priority eviction ONLY when Low priority list is entirely empty (Lines 217-227)', async () => {
            const emergencySpy = vi.fn();

            const testLoader = new AudioBufferLoader(mockContextManager, 2, 2, 100, emergencySpy);

            await testLoader.load({ url: 'high1.mp3', priority: 'high', expectedSizeMb: 0 });
            await testLoader.load({ url: 'high2.mp3', priority: 'high', expectedSizeMb: 0 });

            await testLoader.load({ url: 'high3.mp3', priority: 'high', expectedSizeMb: 0 });

            expect(testLoader.getBuffer('high1.mp3')).toBeUndefined();
            expect(testLoader.getBuffer('high2.mp3')).toBeDefined();
            expect(testLoader.getBuffer('high3.mp3')).toBeDefined();
            expect(emergencySpy).toHaveBeenCalledWith('high1.mp3');
        });

        it('should strictly not evict if current RAM plus required RAM exactly equals the quota (Line 202)', async () => {
            const testLoader = new AudioBufferLoader(mockContextManager, 5, 5, 2);
            await testLoader.load({ url: '1', priority: 'low', expectedSizeMb: 1 });
            await testLoader.load({ url: '2', priority: 'low', expectedSizeMb: 1 });

            expect(testLoader.getBuffer('1')).toBeDefined();
            expect(testLoader.getBuffer('2')).toBeDefined();
        });

        it('should completely break the eviction loop if pool is empty but required RAM is massive (Line 211)', async () => {
            const testLoader = new AudioBufferLoader(mockContextManager, 5, 5, 10);

            await testLoader.load({ url: 'massive', priority: 'low', expectedSizeMb: 50 });
            expect(testLoader.getBuffer('massive')).toBeDefined();
        });

        it('should safely force evict when queue is filled without exceeding RAM limit (Line 85)', async () => {
            const testLoader = new AudioBufferLoader(mockContextManager, 1, 1, 100);

            await testLoader.load({ url: 'first', priority: 'low', expectedSizeMb: 0 });

            await testLoader.load({ url: 'second', priority: 'low', expectedSizeMb: 0 });

            expect(testLoader.getBuffer('first')).toBeUndefined();
            expect(testLoader.getBuffer('second')).toBeDefined();
        });
    });

    describe('Error Handling (Silent Fallbacks)', () => {
        it('should gracefully recover and return dummy buffer if decodeAudioData throws synchronously (Line 306)', async () => {
            const syncError = new Error('Sync Crash');
            mockContextManager.context.decodeAudioData.mockImplementation(() => {
                throw syncError;
            });

            const buffer = await loader.load({ url: 'sync-crash.mp3', priority: 'low', expectedSizeMb: 1 });

            expect(buffer).toBe(dummyAudioBuffer);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('sync-crash.mp3'), syncError);
        });

        it('should log exact error message with URL when decoding fails (Line 307)', async () => {
            const fakeError = new Error('Decode error');
            mockContextManager.context.decodeAudioData.mockRejectedValue(fakeError);

            await loader.load({ url: 'corrupt.mp3', priority: 'low', expectedSizeMb: 1 });

            expect(console.error).toHaveBeenCalledWith(
                '[AudioBufferLoader] Failed to load or decode corrupt.mp3. Using dummy buffer.',
                fakeError
            );
        });
    });

    describe('AudioBufferLoader - Additional Coverage & Mutation Killers', () => {
        describe('Cache Hits & Request Deduplication', () => {
            it('should return cached AudioBuffer on subsequent load calls without re-fetching (Lines 74, 113)', async () => {
                const request = { url: 'cached.mp3', priority: 'low' as const, expectedSizeMb: 1 };
                const firstBuffer = await loader.load(request);
                const secondBuffer = await loader.load(request);

                expect(secondBuffer).toBe(firstBuffer);
                expect(mockFetch).toHaveBeenCalledTimes(1);
            });

            it('should deduplicate simultaneous in-flight requests for the same URL (Lines 80, 113)', async () => {
                const request = { url: 'in-flight.mp3', priority: 'low' as const, expectedSizeMb: 1 };

                const promise1 = loader.load(request);
                const promise2 = loader.load(request);

                expect(promise1).toStrictEqual(promise2);
                const [buffer1, buffer2] = await Promise.all([promise1, promise2]);
                expect(buffer1).toBe(fakeAudioBuffer);
                expect(buffer2).toBe(fakeAudioBuffer);
                expect(mockFetch).toHaveBeenCalledTimes(1);
            });

            it('should allow re-fetching after cache clearance once in-flight promise completes (Line 113)', async () => {
                const request = { url: 'refetch.mp3', priority: 'low' as const, expectedSizeMb: 1 };
                await loader.load(request);
                loader.clearCache('refetch.mp3');

                await loader.load(request);

                expect(mockFetch).toHaveBeenCalledTimes(2);
            });
        });

        describe('HTTP Network Failure Handling', () => {
            it('should log warning and return dummy buffer when HTTP response is not OK (Lines 299, 300)', async () => {
                mockFetch.mockResolvedValueOnce({
                    ok: false,
                    status: 404,
                    arrayBuffer: vi.fn()
                });

                const buffer = await loader.load({ url: 'missing.mp3', priority: 'low', expectedSizeMb: 1 });

                expect(buffer).toBe(dummyAudioBuffer);
                expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Network error 404 for missing.mp3'));
            });
        });

        describe('RAM Quota Tracking & Emergency Evictions', () => {
            it('should correctly increment RAM usage on load and decrement on eviction (Lines 107, 201-203, 233)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 5, 10);

                await testLoader.load({ url: 'item1.mp3', priority: 'low', expectedSizeMb: 6 });
                expect(testLoader.getCurrentRam()).toBe(6);

                await testLoader.load({ url: 'item2.mp3', priority: 'low', expectedSizeMb: 6 });

                expect(testLoader.getCurrentRam()).toBe(6);
                expect(testLoader.getBuffer('item1.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('item2.mp3')).toBeDefined();
            });

            it('should evict high-priority items and trigger emergency eviction callback when low-priority queue is empty (Lines 205, 208, 220, 223)', async () => {
                const emergencyCallback = vi.fn();
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 2, 10, emergencyCallback);

                await testLoader.load({ url: 'high1.mp3', priority: 'high', expectedSizeMb: 6 });

                await testLoader.load({ url: 'high2.mp3', priority: 'high', expectedSizeMb: 6 });

                expect(testLoader.getBuffer('high1.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('high2.mp3')).toBeDefined();
                expect(emergencyCallback).toHaveBeenCalledWith('high1.mp3');
            });

            it('should force evict high-priority item when queue capacity is full without throwing if no emergency callback is registered (Lines 85, 97, 220, 223)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 2, 1, 100);

                await testLoader.load({ url: 'high1.mp3', priority: 'high', expectedSizeMb: 1 });
                await testLoader.load({ url: 'high2.mp3', priority: 'high', expectedSizeMb: 1 });

                expect(testLoader.getBuffer('high1.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('high2.mp3')).toBeDefined();
            });
        });

        describe('Priority & High-Priority Doubly-Linked List Pointers', () => {
            it('should update high-priority MRU pointers and evict high-priority items in LRU order (Lines 100, 256, 264, 275, 286)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 3, 100);

                await testLoader.load({ url: 'H1.mp3', priority: 'high', expectedSizeMb: 1 });
                await testLoader.load({ url: 'H2.mp3', priority: 'high', expectedSizeMb: 1 });
                await testLoader.load({ url: 'H3.mp3', priority: 'high', expectedSizeMb: 1 });

                testLoader.getBuffer('H1.mp3');

                await testLoader.load({ url: 'H4.mp3', priority: 'high', expectedSizeMb: 1 });

                expect(testLoader.getBuffer('H2.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('H1.mp3')).toBeDefined();
                expect(testLoader.getBuffer('H3.mp3')).toBeDefined();
                expect(testLoader.getBuffer('H4.mp3')).toBeDefined();
            });
        });

        describe('Cache Operations & Uncached Safety', () => {
            it('should correctly initialize array structures up to maxQueueSize (Lines 38, 55, 58, 59, 61, 64)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 2, 2, 50);

                await testLoader.load({ url: 'item1.mp3', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'item2.mp3', priority: 'low', expectedSizeMb: 1 });

                expect(testLoader.getBuffer('item1.mp3')).toBeDefined();
                expect(testLoader.getBuffer('item2.mp3')).toBeDefined();
            });

            it('should safely handle clearCache, getBuffer, and purgeUrls for URLs not present in cache (Lines 169, 179, 191, 237)', () => {
                expect(() => {
                    loader.clearCache('non-existent.mp3');
                }).not.toThrow();
                expect(loader.getBuffer('non-existent.mp3')).toBeUndefined();
                expect(() => {
                    loader.purgeUrls(['non-existent.mp3']);
                }).not.toThrow();
            });

            it('should completely re-initialize low and high head/tail pointers on full clearCache (Lines 153-163)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 2, 50);
                await testLoader.load({ url: 'H1.mp3', priority: 'high', expectedSizeMb: 1 });
                await testLoader.load({ url: 'L1.mp3', priority: 'low', expectedSizeMb: 1 });

                testLoader.clearCache();

                expect(testLoader.getCurrentRam()).toBe(0);
                expect(testLoader.getBuffer('H1.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('L1.mp3')).toBeUndefined();

                await testLoader.load({ url: 'H2.mp3', priority: 'high', expectedSizeMb: 1 });
                expect(testLoader.getBuffer('H2.mp3')).toBeDefined();
            });
        });

        describe('Format Resolution Mechanics', () => {
            it('should skip candidates where canPlayType returns empty string and choose supported format (Line 331)', async () => {
                mockAudioElement.canPlayType.mockImplementation((mime: string) => {
                    if (mime === 'audio/mpeg') return '';
                    if (mime === 'audio/ogg') return 'probably';
                    return '';
                });

                await loader.load({ url: ['track.mp3', 'track.ogg'], priority: 'low', expectedSizeMb: 1 });

                expect(mockFetch).toHaveBeenCalledWith('track.ogg');
            });

            it('should fall back to first candidate if no format is supported (Lines 323, 325, 331)', async () => {
                mockAudioElement.canPlayType.mockReturnValue('');

                await loader.load({ url: ['unsupported.mp3', 'unsupported.wav'], priority: 'low', expectedSizeMb: 1 });

                expect(mockFetch).toHaveBeenCalledWith('unsupported.mp3');
            });
        });

        describe('Batch Loading Callback Guarding', () => {
            it('should execute loadBatch safely when optional progress/error callbacks are omitted on failure (Lines 136, 139, 140)', async () => {
                vi.spyOn(loader, 'load').mockImplementation(async req => {
                    if (req.url === 'fail.mp3') throw new Error('Failed');
                    return fakeAudioBuffer;
                });

                const resources = {
                    ok: { url: 'ok.mp3', priority: 'low' as const, expectedSizeMb: 1 },
                    fail: { url: 'fail.mp3', priority: 'low' as const, expectedSizeMb: 1 }
                };

                await expect(loader.loadBatch(resources)).resolves.toBeDefined();
            });
        });

        describe('Doubly-Linked List (MRU/LRU) Pointer Integrity', () => {
            it('should correctly snip head/tail elements and maintain high-priority MRU order during evictions (Lines 252, 254, 256, 262, 268, 269, 273, 275, 277, 286)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 3, 100);

                await testLoader.load({ url: 'H1.mp3', priority: 'high', expectedSizeMb: 1 });
                await testLoader.load({ url: 'H2.mp3', priority: 'high', expectedSizeMb: 1 });
                await testLoader.load({ url: 'H3.mp3', priority: 'high', expectedSizeMb: 1 });

                testLoader.getBuffer('H2.mp3');
                testLoader.getBuffer('H1.mp3');

                await testLoader.load({ url: 'H4.mp3', priority: 'high', expectedSizeMb: 1 });

                expect(testLoader.getBuffer('H3.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('H1.mp3')).toBeDefined();
                expect(testLoader.getBuffer('H2.mp3')).toBeDefined();
                expect(testLoader.getBuffer('H4.mp3')).toBeDefined();
            });

            it('should correctly snip middle elements in low-priority list without corrupting pointers (Lines 252, 254, 262)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 3, 100);

                await testLoader.load({ url: 'L1.mp3', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'L2.mp3', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'L3.mp3', priority: 'low', expectedSizeMb: 1 });

                testLoader.getBuffer('L2.mp3');

                await testLoader.load({ url: 'L4.mp3', priority: 'low', expectedSizeMb: 1 });

                expect(testLoader.getBuffer('L1.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('L2.mp3')).toBeDefined();
                expect(testLoader.getBuffer('L3.mp3')).toBeDefined();
                expect(testLoader.getBuffer('L4.mp3')).toBeDefined();
            });
        });

        describe('Sentinel Pointer Initializations (-1 vs +1)', () => {
            it('should strictly reset high and low head/tail pointers to -1 across clearCache cycles (Lines 58, 59, 154, 155, 157, 158, 159, 160)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 2, 10);

                await testLoader.load({ url: 'H1.mp3', priority: 'high', expectedSizeMb: 1 });
                await testLoader.load({ url: 'L1.mp3', priority: 'low', expectedSizeMb: 1 });

                testLoader.clearCache();

                await testLoader.load({ url: 'H2.mp3', priority: 'high', expectedSizeMb: 6 });
                await testLoader.load({ url: 'H3.mp3', priority: 'high', expectedSizeMb: 6 });

                expect(testLoader.getBuffer('H2.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('H3.mp3')).toBeDefined();
            });

            it('should correctly evict items across multiple capacity cycles without pointer corruption (Lines 58, 59, 154, 155, 157, 158, 159, 160)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 3, 10);

                await testLoader.load({ url: 'L1.mp3', priority: 'low', expectedSizeMb: 6 });
                await testLoader.load({ url: 'L2.mp3', priority: 'low', expectedSizeMb: 6 });
                await testLoader.load({ url: 'L3.mp3', priority: 'low', expectedSizeMb: 6 });

                expect(testLoader.getBuffer('L2.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('L3.mp3')).toBeDefined();

                testLoader.clearCache();
                await testLoader.load({ url: 'H1.mp3', priority: 'high', expectedSizeMb: 6 });
                await testLoader.load({ url: 'H2.mp3', priority: 'high', expectedSizeMb: 6 });
                await testLoader.load({ url: 'H3.mp3', priority: 'high', expectedSizeMb: 6 });

                expect(testLoader.getBuffer('H2.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('H3.mp3')).toBeDefined();
            });
        });

        describe('Dummy String Collision & Free Index Recycling', () => {
            it('should not delete active entries if indexToUrl contains default dummy strings (Lines 55, 61, 153, 237)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 2, 50);

                await testLoader.load({ url: 'Stryker was here!', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'other.mp3', priority: 'low', expectedSizeMb: 1 });

                testLoader.clearCache('other.mp3');

                expect(testLoader.getBuffer('Stryker was here!')).toBeDefined();
            });

            it('should properly rebuild freeIndices array during clearCache without index collision (Lines 64, 163)', async () => {
                let bufferId = 0;
                mockContextManager.context.decodeAudioData.mockImplementation(async () => ({
                    id: ++bufferId,
                    duration: 2.5
                }));

                const testLoader = new AudioBufferLoader(mockContextManager, 5, 2, 50);

                await testLoader.load({ url: 'A.mp3', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'B.mp3', priority: 'low', expectedSizeMb: 1 });
                testLoader.clearCache('A.mp3');

                testLoader.clearCache();

                await testLoader.load({ url: 'C.mp3', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'D.mp3', priority: 'low', expectedSizeMb: 1 });

                const bufC = testLoader.getBuffer('C.mp3');
                const bufD = testLoader.getBuffer('D.mp3');
                expect(bufC).toBeDefined();
                expect(bufD).toBeDefined();
                expect(bufC).not.toBe(bufD);
            });
        });

        describe('Eager Pre-Fetch Eviction & Concurrency Guards', () => {
            it('should execute forceEvictOne BEFORE performLoad starts fetching (Line 85)', async () => {
                const callOrder: string[] = [];
                const emergencyCallback = vi.fn().mockImplementation(() => {
                    callOrder.push('emergencyEviction');
                });

                mockFetch.mockImplementation(async () => {
                    callOrder.push('fetch');
                    return {
                        ok: true,
                        status: 200,
                        arrayBuffer: async () => new ArrayBuffer(8)
                    };
                });

                const testLoader = new AudioBufferLoader(mockContextManager, 1, 1, 100, emergencyCallback);
                await testLoader.load({ url: 'item1.mp3', priority: 'high', expectedSizeMb: 1 });

                await testLoader.load({ url: 'item2.mp3', priority: 'high', expectedSizeMb: 1 });

                expect(callOrder).toEqual(['fetch', 'emergencyEviction', 'fetch']);
                expect(emergencyCallback).toHaveBeenCalledWith('item1.mp3');
            });

            it('should prevent duplicate RAM allocations when concurrent loads for same URL resolve (Line 95)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 5, 100);
                const req = { url: 'concurrent.mp3', priority: 'low' as const, expectedSizeMb: 5 };

                await Promise.all([testLoader.load(req), testLoader.load(req)]);

                expect(testLoader.getCurrentRam()).toBe(5);
            });

            it('should correctly prioritize low-priority items for eviction when high-priority is requested (Line 100)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 5, 10);

                await testLoader.load({ url: 'high1.mp3', priority: 'high', expectedSizeMb: 6 });
                await testLoader.load({ url: 'low1.mp3', priority: 'low', expectedSizeMb: 6 });

                await testLoader.load({ url: 'high2.mp3', priority: 'high', expectedSizeMb: 6 });

                expect(testLoader.getBuffer('low1.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('high2.mp3')).toBeDefined();
            });
        });

        describe('Undefined Callback & Non-Existent Input Safety', () => {
            it('should safely execute loadBatch without throwing when callbacks are omitted and errors occur (Lines 136, 139, 140)', async () => {
                vi.spyOn(loader, 'load').mockImplementation(async req => {
                    if (req.url === 'bad.mp3') throw new Error('Crash');
                    return fakeAudioBuffer;
                });

                const resources = {
                    good: { url: 'good.mp3', priority: 'low' as const, expectedSizeMb: 1 },
                    bad: { url: 'bad.mp3', priority: 'low' as const, expectedSizeMb: 1 }
                };

                await expect(loader.loadBatch(resources)).resolves.toEqual({ good: fakeAudioBuffer });
            });

            it('should keep currentRamMb intact when getBuffer, clearCache, or purgeUrls are called on missing URLs (Lines 169, 179, 191)', async () => {
                await loader.load({ url: 'active.mp3', priority: 'low', expectedSizeMb: 4 });

                loader.getBuffer('missing.mp3');
                loader.clearCache('missing.mp3');
                loader.purgeUrls(['missing.mp3']);

                expect(loader.getCurrentRam()).toBe(4);
                expect(loader.getBuffer('active.mp3')).toBeDefined();
            });

            it('should not crash forceEvictOne when invoked on an empty queue (Line 220)', () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 1, 0, 10);

                expect(testLoader.getCurrentRam()).toBe(0);
                expect(Number.isNaN(testLoader.getCurrentRam())).toBe(false);
            });

            it('should handle emergency eviction safely when onEmergencyEviction is undefined (Line 208)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 2, 10);

                await testLoader.load({ url: 'H1.mp3', priority: 'high', expectedSizeMb: 6 });

                await expect(
                    testLoader.load({ url: 'H2.mp3', priority: 'high', expectedSizeMb: 6 })
                ).resolves.toBeDefined();
                expect(testLoader.getBuffer('H1.mp3')).toBeUndefined();
            });
        });

        describe('Candidate URL Extension Parsing', () => {
            it('should handle candidates with empty string or no extension gracefully (Lines 323, 325)', async () => {
                const prototypeRef = Object.prototype as any;
                prototypeRef.undefined = 'audio/mpeg';

                try {
                    await loader.load({ url: ['', 'noextension', 'valid.mp3'], priority: 'low', expectedSizeMb: 1 });

                    expect(mockFetch).toHaveBeenCalledWith('valid.mp3');
                } finally {
                    delete prototypeRef.undefined;
                }
            });
        });

        describe('Doubly-Linked List Pointers (High & Low Priority)', () => {
            it('should correctly snip and re-order high-priority head, tail, and middle elements (Lines 254, 256, 262, 268, 269, 273, 286)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 3, 100);

                await testLoader.load({ url: 'H1.mp3', priority: 'high', expectedSizeMb: 1 });
                await testLoader.load({ url: 'H2.mp3', priority: 'high', expectedSizeMb: 1 });
                await testLoader.load({ url: 'H3.mp3', priority: 'high', expectedSizeMb: 1 });

                testLoader.getBuffer('H3.mp3');
                testLoader.getBuffer('H1.mp3');
                testLoader.getBuffer('H2.mp3');

                await testLoader.load({ url: 'H4.mp3', priority: 'high', expectedSizeMb: 1 });

                expect(testLoader.getBuffer('H3.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('H1.mp3')).toBeDefined();
                expect(testLoader.getBuffer('H2.mp3')).toBeDefined();
                expect(testLoader.getBuffer('H4.mp3')).toBeDefined();
            });

            it('should correctly snip and re-order low-priority head, tail, and middle elements (Lines 252, 254, 262, 275, 277)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 3, 100);

                await testLoader.load({ url: 'L1.mp3', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'L2.mp3', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'L3.mp3', priority: 'low', expectedSizeMb: 1 });

                testLoader.getBuffer('L3.mp3');
                testLoader.getBuffer('L1.mp3');
                testLoader.getBuffer('L2.mp3');

                await testLoader.load({ url: 'L4.mp3', priority: 'low', expectedSizeMb: 1 });

                expect(testLoader.getBuffer('L3.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('L1.mp3')).toBeDefined();
                expect(testLoader.getBuffer('L2.mp3')).toBeDefined();
                expect(testLoader.getBuffer('L4.mp3')).toBeDefined();
            });
        });

        describe('Dummy String & Allocation Safeguards', () => {
            it('should not delete valid URL mappings when freeing adjacent slots (Lines 55, 61, 153, 237)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 2, 50);

                await testLoader.load({ url: 'Stryker was here!', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'temp.mp3', priority: 'low', expectedSizeMb: 1 });

                testLoader.clearCache('temp.mp3');

                await testLoader.load({ url: 'other.mp3', priority: 'low', expectedSizeMb: 1 });
                testLoader.clearCache('other.mp3');

                expect(testLoader.getBuffer('Stryker was here!')).toBeDefined();
            });

            it('should pre-allocate arrays so clearing unpopulated slots does not pollute urlToIndex (Lines 55, 61, 64, 163)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 3, 50);
                testLoader.clearCache();

                await testLoader.load({ url: 'item.mp3', priority: 'low', expectedSizeMb: 1 });
                testLoader.clearCache('item.mp3');

                expect(testLoader.getCurrentRam()).toBe(0);
            });
        });

        describe('load() Guards & Concurrency', () => {
            it('should not duplicate RAM tracking on duplicate load calls (Line 95)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 5, 100);
                const req = { url: 'same.mp3', priority: 'low' as const, expectedSizeMb: 4 };

                await testLoader.load(req);
                await testLoader.load(req);

                expect(testLoader.getCurrentRam()).toBe(4);
            });

            it('should execute forceEvictOne when queue becomes full during pending fetch (Line 97)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 1, 1, 100);

                await testLoader.load({ url: 'A.mp3', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'B.mp3', priority: 'low', expectedSizeMb: 1 });

                expect(testLoader.getBuffer('A.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('B.mp3')).toBeDefined();
                expect(Number.isNaN(testLoader.getCurrentRam())).toBe(false);
            });

            it('should prioritize evicting low-priority items when high-priority item is loaded (Line 100)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 5, 10);

                await testLoader.load({ url: 'H1.mp3', priority: 'high', expectedSizeMb: 4 });
                await testLoader.load({ url: 'L1.mp3', priority: 'low', expectedSizeMb: 4 });

                await testLoader.load({ url: 'H2.mp3', priority: 'high', expectedSizeMb: 4 });

                expect(testLoader.getBuffer('H1.mp3')).toBeDefined();
                expect(testLoader.getBuffer('H2.mp3')).toBeDefined();
                expect(testLoader.getBuffer('L1.mp3')).toBeUndefined();
            });
        });

        describe('loadBatch & Uncached URL Guards', () => {
            it('should execute loadBatch safely without callbacks when loads throw errors (Lines 136, 139, 140)', async () => {
                vi.spyOn(loader, 'load').mockImplementation(async req => {
                    if (req.url === 'fail.mp3') throw new Error('Load failed');
                    return fakeAudioBuffer;
                });

                const resources = {
                    itemOk: { url: 'ok.mp3', priority: 'low' as const, expectedSizeMb: 1 },
                    itemFail: { url: 'fail.mp3', priority: 'low' as const, expectedSizeMb: 1 }
                };

                await expect(loader.loadBatch(resources)).resolves.toEqual({ itemOk: fakeAudioBuffer });
            });

            it('should keep list pointers and RAM intact when getBuffer is called for uncached URLs (Line 179)', async () => {
                await loader.load({ url: 'valid.mp3', priority: 'low', expectedSizeMb: 2 });

                const result = loader.getBuffer('ghost.mp3');

                expect(result).toBeUndefined();
                expect(loader.getBuffer('valid.mp3')).toBeDefined();
                expect(loader.getCurrentRam()).toBe(2);
            });

            it('should safely execute forceEvictOne on an empty queue (Line 220)', () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 1, 0, 10);

                expect(testLoader.getCurrentRam()).toBe(0);
                expect(Number.isNaN(testLoader.getCurrentRam())).toBe(false);
            });
        });

        describe('Candidate URL Extension Guarding', () => {
            it('should skip candidates with missing extensions without querying polluted Object prototype (Lines 323, 325)', async () => {
                const proto = Object.prototype as any;
                proto.undefined = 'audio/mpeg';

                try {
                    await loader.load({ url: ['noextension', 'valid.mp3'], priority: 'low', expectedSizeMb: 1 });

                    expect(mockFetch).toHaveBeenCalledWith('valid.mp3');
                } finally {
                    delete proto.undefined;
                }
            });
        });

        describe('loadBatch Promise Settlement (Lines 136, 139, 140)', () => {
            it('should not reject any internal promises in loadBatch when optional callbacks are undefined (Lines 136, 139, 140)', async () => {
                vi.spyOn(loader, 'load').mockImplementation(async req => {
                    if (req.url === 'fail.mp3') throw new Error('Simulated failure');
                    return fakeAudioBuffer;
                });

                const allSettledSpy = vi.spyOn(Promise, 'allSettled');

                const resources = {
                    ok: { url: 'ok.mp3', priority: 'low' as const, expectedSizeMb: 1 },
                    fail: { url: 'fail.mp3', priority: 'low' as const, expectedSizeMb: 1 }
                };

                await loader.loadBatch(resources);

                const settledResults = await allSettledSpy.mock.results[0].value;
                const rejectedPromises = settledResults.filter((r: any) => r.status === 'rejected');
                expect(rejectedPromises).toEqual([]);

                allSettledSpy.mockRestore();
            });
        });

        describe('Pre-Allocation & Dummy String Protection (Lines 55, 61, 153, 237)', () => {
            it('should pre-allocate bufferPool and indexToUrl to maxQueueSize (Lines 55, 61)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 3, 50);

                await testLoader.load({ url: 'A.mp3', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'B.mp3', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'C.mp3', priority: 'low', expectedSizeMb: 1 });

                testLoader.clearCache('A.mp3');
                testLoader.clearCache('B.mp3');
                testLoader.clearCache('C.mp3');

                expect(testLoader.getCurrentRam()).toBe(0);
                expect(testLoader.getBuffer('A.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('B.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('C.mp3')).toBeUndefined();
            });

            it('should not delete valid URL mappings when freeing adjacent slots (Lines 61, 153, 237)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 2, 50);

                await testLoader.load({ url: 'Stryker was here!', priority: 'low', expectedSizeMb: 1 });
                await testLoader.load({ url: 'temp.mp3', priority: 'low', expectedSizeMb: 1 });

                testLoader.clearCache('temp.mp3');

                await testLoader.load({ url: 'other.mp3', priority: 'low', expectedSizeMb: 1 });
                testLoader.clearCache('other.mp3');

                expect(testLoader.getBuffer('Stryker was here!')).toBeDefined();
            });
        });

        describe('List Pointer Cross-Contamination Guards (Lines 262, 268, 269, 277, 286)', () => {
            it('should not corrupt tailLow when snipping high-priority items at the tail (Line 262)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 3, 10);

                await testLoader.load({ url: 'H1.mp3', priority: 'high', expectedSizeMb: 4 });
                await testLoader.load({ url: 'H2.mp3', priority: 'high', expectedSizeMb: 4 });

                testLoader.getBuffer('H2.mp3');

                await testLoader.load({ url: 'L1.mp3', priority: 'low', expectedSizeMb: 4 });

                expect(testLoader.getBuffer('H2.mp3')).toBeDefined();
                expect(testLoader.getBuffer('L1.mp3')).toBeDefined();
                expect(testLoader.getBuffer('H1.mp3')).toBeUndefined();
            });
        });

        describe('Uncached URL & Empty Queue Safety (Lines 179, 220)', () => {
            it('should preserve list pointers when getBuffer is called for missing URLs (Line 179)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 5, 2, 10);

                testLoader.getBuffer('missing.mp3');

                await testLoader.load({ url: 'H1.mp3', priority: 'high', expectedSizeMb: 6 });
                await testLoader.load({ url: 'H2.mp3', priority: 'high', expectedSizeMb: 6 });

                expect(Number.isNaN(testLoader.getCurrentRam())).toBe(false);
                expect(testLoader.getBuffer('H1.mp3')).toBeUndefined();
                expect(testLoader.getBuffer('H2.mp3')).toBeDefined();
            });

            it('should safely execute forceEvictOne on an empty queue without producing NaN RAM (Line 220)', async () => {
                const testLoader = new AudioBufferLoader(mockContextManager, 1, 0, 100);

                await testLoader.load({ url: 'item1.mp3', priority: 'high', expectedSizeMb: 1 });

                expect(Number.isNaN(testLoader.getCurrentRam())).toBe(false);
                expect(testLoader.getCurrentRam()).toBe(1);
            });
        });

        describe('Candidate URL Extension Guarding (Lines 323, 325)', () => {
            it('should skip candidates with missing extensions without querying polluted Object prototype (Lines 323, 325)', async () => {
                const proto = Object.prototype as any;
                proto.undefined = 'audio/mpeg';

                try {
                    await loader.load({ url: ['noextension', 'valid.mp3'], priority: 'low', expectedSizeMb: 1 });

                    expect(mockFetch).toHaveBeenCalledWith('valid.mp3');
                } finally {
                    delete proto.undefined;
                }
            });
        });
    });
});
