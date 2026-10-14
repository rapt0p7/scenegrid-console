import type { IBankManifest } from '@domain/Configuration/Ports/IBankConfig.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';

import { BankId, SoundId } from '@scene-grid/shared';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BankManagerAdapter } from '../BankManagerAdapter.js';

describe('BankManagerAdapter', () => {
    let mockLoader: any;
    let mockPool: any;
    let mockRouter: any;
    let mockEvents: any;
    let mockPrecalculatedSizes: Record<string, number>;

    const bankManifest: IBankManifest = {
        ['bank_1' as BankId]: { id: 'bank_1' as BankId, sounds: ['s1' as SoundId, 's2' as SoundId, 's3' as SoundId] },
        ['empty_bank' as BankId]: { id: 'empty_bank' as BankId, sounds: [] }
    };

    const soundManifest: ISpriteSoundManifest = {
        ['s1' as SoundId]: { url: 'url1', priority: 'high' },
        ['s2' as SoundId]: { url: 'url2' },
        ['s3' as SoundId]: { url: 'url_unknown_size' }
    };

    beforeEach(() => {
        mockLoader = {
            loadBatch: vi.fn().mockResolvedValue(undefined),
            purgeUrls: vi.fn()
        };
        mockPool = { purgeSound: vi.fn() };
        mockRouter = { stop: vi.fn() };
        mockEvents = {
            onStart: vi.fn(),
            onProgress: vi.fn(),
            onError: vi.fn(),
            onComplete: vi.fn(),
            onUnload: vi.fn()
        };
        mockPrecalculatedSizes = {
            url1: 1.5,
            url2: 3.2
        };
    });

    function createAdapter() {
        return new BankManagerAdapter(
            bankManifest,
            soundManifest,
            mockLoader,
            mockPool,
            mockRouter,
            mockPrecalculatedSizes,
            mockEvents
        );
    }

    describe('loadBank', () => {
        it('should change state to LOADED and pass correct DTOs to loader', async () => {
            const adapter = createAdapter();
            await adapter.loadBank('bank_1' as any);

            expect(adapter.getBankState('bank_1' as any)).toBe('LOADED');
            expect(mockLoader.loadBatch).toHaveBeenCalledWith(
                {
                    s1: { url: 'url1', priority: 'high', expectedSizeMb: 1.5 },
                    s2: { url: 'url2', priority: 'low', expectedSizeMb: 3.2 },
                    s3: { url: 'url_unknown_size', priority: 'low', expectedSizeMb: 5.0 }
                },
                expect.any(Function),
                expect.any(Function)
            );
            expect(mockEvents.onComplete).toHaveBeenCalled();
        });

        it('should handle loading state to prevent redundant requests', async () => {
            const adapter = createAdapter();
            const p1 = adapter.loadBank('bank_1' as any);
            const p2 = adapter.loadBank('bank_1' as any);

            await Promise.all([p1, p2]);
            expect(mockLoader.loadBatch).toHaveBeenCalledTimes(1);
        });

        it('should execute onError and onComplete with failed items on loader rejection', async () => {
            mockLoader.loadBatch.mockImplementation(async (_urls: any, _prog: any, err: any) => {
                err('s1', new Error('Fail'));
                throw new Error('Batch failed');
            });

            const adapter = createAdapter();
            const result = await adapter.loadBank('bank_1' as any);
            expect(result.ok).toBe(false);

            expect(adapter.getBankState('bank_1' as any)).toBe('ERROR');
            expect(mockEvents.onError).toHaveBeenCalledWith('s1', expect.any(Error));
            expect(mockEvents.onComplete).toHaveBeenCalledWith(['s1'], expect.any(Number));
        });
    });

    describe('unloadBank', () => {
        it('should perform full cleanup of sounds, pool, and loader cache', async () => {
            const adapter = createAdapter();
            const bankId = 'bank_1' as any;

            adapter.unloadBank(bankId);

            expect(mockRouter.stop).toHaveBeenCalledTimes(3);
            expect(mockRouter.stop).toHaveBeenCalledWith('s1', { allowTail: false });
            expect(mockRouter.stop).toHaveBeenCalledWith('s2', { allowTail: false });
            expect(mockRouter.stop).toHaveBeenCalledWith('s3', { allowTail: false });

            expect(mockPool.purgeSound).toHaveBeenCalledTimes(3);
            expect(mockPool.purgeSound).toHaveBeenCalledWith('s1');
            expect(mockPool.purgeSound).toHaveBeenCalledWith('s2');
            expect(mockPool.purgeSound).toHaveBeenCalledWith('s3');

            expect(mockLoader.purgeUrls).toHaveBeenCalledTimes(1);
            expect(mockLoader.purgeUrls).toHaveBeenCalledWith(['url1', 'url2', 'url_unknown_size']);

            expect(adapter.getBankState(bankId)).toBe('UNLOADED');
            expect(mockEvents.onUnload).toHaveBeenCalledWith(bankId);
        });

        it('should do nothing if bankId is not in manifest', () => {
            const adapter = createAdapter();
            adapter.unloadBank('unknown' as any);
            expect(mockRouter.stop).not.toHaveBeenCalled();
        });
    });

    it('should not reload or trigger batch loading if bank is already in LOADED state', async () => {
        const adapter = createAdapter();
        const bankId = 'bank_1' as BankId;
        await adapter.loadBank(bankId);
        expect(adapter.getBankState(bankId)).toBe('LOADED');
        expect(mockLoader.loadBatch).toHaveBeenCalledTimes(1);
        expect(mockEvents.onStart).toHaveBeenCalledTimes(1);

        await adapter.loadBank(bankId);

        expect(mockLoader.loadBatch).toHaveBeenCalledTimes(1);
        expect(mockEvents.onStart).toHaveBeenCalledTimes(1);
        expect(adapter.getBankState(bankId)).toBe('LOADED');
    });

    it('should log a descriptive warning and abort loading when bank is not in manifest', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const adapter = createAdapter();
        const unknownBankId = 'missing_bank' as BankId;

        await adapter.loadBank(unknownBankId);

        expect(warnSpy).toHaveBeenCalledWith('[BankManager] Bank "missing_bank" not found in manifest.');
        expect(mockLoader.loadBatch).not.toHaveBeenCalled();
        expect(mockEvents.onStart).not.toHaveBeenCalled();
        expect(adapter.getBankState(unknownBankId)).toBe('UNLOADED');

        warnSpy.mockRestore();
    });

    it('should ignore sounds missing from soundManifest and only load defined entries', async () => {
        const customBankManifest: IBankManifest = {
            ['partial_bank' as BankId]: {
                id: 'partial_bank' as BankId,
                sounds: ['s1' as SoundId, 'unregistered_sound' as SoundId]
            }
        };
        const customSoundManifest: ISpriteSoundManifest = {
            ['s1' as SoundId]: { url: 'url1', priority: 'high' }
        };
        const adapter = new BankManagerAdapter(
            customBankManifest,
            customSoundManifest,
            mockLoader,
            mockPool,
            mockRouter,
            mockPrecalculatedSizes,
            mockEvents
        );

        await adapter.loadBank('partial_bank' as BankId);

        expect(mockEvents.onStart).toHaveBeenCalledWith(1);
        expect(mockLoader.loadBatch).toHaveBeenCalledWith(
            {
                s1: { url: 'url1', priority: 'high', expectedSizeMb: 1.5 }
            },
            expect.any(Function),
            expect.any(Function)
        );
        expect(adapter.getBankState('partial_bank' as BankId)).toBe('LOADED');
    });

    it('should calculate and pass exact elapsed durationMs (endTime - startTime) to onComplete', async () => {
        const perfSpy = vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1250);

        const adapter = createAdapter();

        await adapter.loadBank('bank_1' as BankId);

        expect(mockEvents.onComplete).toHaveBeenCalledWith([], 250);

        perfSpy.mockRestore();
    });

    it('should skip undefined sound metadata when purging URLs during unloadBank', () => {
        const customBankManifest: IBankManifest = {
            ['partial_bank' as BankId]: {
                id: 'partial_bank' as BankId,
                sounds: ['s1' as SoundId, 'unregistered_sound' as SoundId]
            }
        };
        const customSoundManifest: ISpriteSoundManifest = {
            ['s1' as SoundId]: { url: 'url1', priority: 'high' }
        };
        const adapter = new BankManagerAdapter(
            customBankManifest,
            customSoundManifest,
            mockLoader,
            mockPool,
            mockRouter,
            mockPrecalculatedSizes,
            mockEvents
        );

        adapter.unloadBank('partial_bank' as BankId);

        expect(mockRouter.stop).toHaveBeenCalledWith('s1', { allowTail: false });
        expect(mockRouter.stop).toHaveBeenCalledWith('unregistered_sound', { allowTail: false });
        expect(mockPool.purgeSound).toHaveBeenCalledWith('s1');
        expect(mockPool.purgeSound).toHaveBeenCalledWith('unregistered_sound');
        expect(mockLoader.purgeUrls).toHaveBeenCalledWith(['url1']);
        expect(adapter.getBankState('partial_bank' as BankId)).toBe('UNLOADED');
        expect(mockEvents.onUnload).toHaveBeenCalledWith('partial_bank');
    });

    describe('Streaming Manifests & Unified Loading', () => {
        const mockStreamManifest = {
            isLooping: true,
            chunks: [{ url: '/streams/chunk_0.ogg', durationSamples: 44100, trimStartSamples: 0 }]
        };

        it('should detect stream sound by .json URL, fetch manifest, and bypass AudioBufferLoader', async () => {
            const streamBankManifest: IBankManifest = {
                ['stream_bank' as BankId]: { id: 'stream_bank' as BankId, sounds: ['stream_sound' as SoundId] }
            };
            const streamSoundManifest: ISpriteSoundManifest = {
                ['stream_sound' as SoundId]: { url: '/assets/stream.json' }
            };

            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockStreamManifest)
            });
            globalThis.fetch = fetchMock;

            const adapter = new BankManagerAdapter(
                streamBankManifest,
                streamSoundManifest,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes,
                mockEvents
            );

            const result = await adapter.loadBank('stream_bank' as BankId);

            expect(result.ok).toBe(true);
            expect(fetchMock).toHaveBeenCalledWith('/assets/stream.json');
            expect(mockLoader.loadBatch).not.toHaveBeenCalled();
            expect(adapter.getStreamManifest('/assets/stream.json')).toEqual(mockStreamManifest);
            expect(adapter.getBankState('stream_bank' as BankId)).toBe('LOADED');
        });

        it('should detect stream sound by explicit isStream: true flag even without .json URL', async () => {
            const streamBankManifest: IBankManifest = {
                ['stream_bank' as BankId]: { id: 'stream_bank' as BankId, sounds: ['custom_stream' as SoundId] }
            };
            const streamSoundManifest: ISpriteSoundManifest = {
                ['custom_stream' as SoundId]: { url: 'https://cdn.example.com/audio-stream', isStream: true }
            };

            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockStreamManifest)
            });
            globalThis.fetch = fetchMock;

            const adapter = new BankManagerAdapter(
                streamBankManifest,
                streamSoundManifest,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes,
                mockEvents
            );

            const result = await adapter.loadBank('stream_bank' as BankId);

            expect(result.ok).toBe(true);
            expect(fetchMock).toHaveBeenCalledWith('https://cdn.example.com/audio-stream');
            expect(mockLoader.loadBatch).not.toHaveBeenCalled();
            expect(adapter.getStreamManifest('https://cdn.example.com/audio-stream')).toEqual(mockStreamManifest);
        });

        it('should aggregate progress across both buffer sounds and stream manifests', async () => {
            const mixedBankManifest: IBankManifest = {
                ['mixed_bank' as BankId]: {
                    id: 'mixed_bank' as BankId,
                    sounds: ['s1' as SoundId, 'stream_1' as SoundId]
                }
            };
            const mixedSoundManifest: ISpriteSoundManifest = {
                ['s1' as SoundId]: { url: 'url1' },
                ['stream_1' as SoundId]: { url: '/streams/ambient.json' }
            };

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockStreamManifest)
            });

            mockLoader.loadBatch.mockImplementation(
                (_urls: any, onProgress: (loaded: number, total: number, lastKey: string) => void) => {
                    onProgress(1, 1, 's1');
                    return Promise.resolve({});
                }
            );

            const adapter = new BankManagerAdapter(
                mixedBankManifest,
                mixedSoundManifest,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes,
                mockEvents
            );

            await adapter.loadBank('mixed_bank' as BankId);

            expect(mockEvents.onStart).toHaveBeenCalledWith(2);
            expect(mockEvents.onProgress).toHaveBeenCalledWith(
                expect.any(Number),
                2,
                expect.any(Number),
                expect.any(String)
            );
            expect(mockLoader.loadBatch).toHaveBeenCalledTimes(1);
            expect(globalThis.fetch).toHaveBeenCalledWith('/streams/ambient.json');
            expect(adapter.getBankState('mixed_bank' as BankId)).toBe('LOADED');
        });

        it('should block unsafe manifest URLs under SSRF validation and transition to ERROR', async () => {
            const unsafeBankManifest: IBankManifest = {
                ['unsafe_bank' as BankId]: { id: 'unsafe_bank' as BankId, sounds: ['evil_stream' as SoundId] }
            };
            const unsafeSoundManifest: ISpriteSoundManifest = {
                ['evil_stream' as SoundId]: { url: 'http://169.254.169.254/metadata.json' }
            };

            const fetchMock = vi.fn();
            globalThis.fetch = fetchMock;

            const adapter = new BankManagerAdapter(
                unsafeBankManifest,
                unsafeSoundManifest,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes,
                mockEvents
            );

            const result = await adapter.loadBank('unsafe_bank' as BankId);

            expect(result.ok).toBe(false);
            expect(fetchMock).not.toHaveBeenCalled();
            expect(mockEvents.onError).toHaveBeenCalledWith('evil_stream', expect.any(Error));
            expect(adapter.getBankState('unsafe_bank' as BankId)).toBe('ERROR');
        });

        it('should report error and transition to ERROR when stream manifest fetch fails', async () => {
            const failBankManifest: IBankManifest = {
                ['fail_bank' as BankId]: { id: 'fail_bank' as BankId, sounds: ['broken_stream' as SoundId] }
            };
            const failSoundManifest: ISpriteSoundManifest = {
                ['broken_stream' as SoundId]: { url: '/broken.json' }
            };

            globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

            const adapter = new BankManagerAdapter(
                failBankManifest,
                failSoundManifest,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes,
                mockEvents
            );

            const result = await adapter.loadBank('fail_bank' as BankId);

            expect(result.ok).toBe(false);
            expect(mockEvents.onError).toHaveBeenCalledWith('broken_stream', expect.any(Error));
            expect(adapter.getBankState('fail_bank' as BankId)).toBe('ERROR');
        });

        it('should stop stream playback, purge manifest from cache, and avoid buffer loader purge on unload', async () => {
            const streamBankManifest: IBankManifest = {
                ['stream_bank' as BankId]: { id: 'stream_bank' as BankId, sounds: ['stream_sound' as SoundId] }
            };
            const streamSoundManifest: ISpriteSoundManifest = {
                ['stream_sound' as SoundId]: { url: '/assets/stream.json' }
            };

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockStreamManifest)
            });

            const adapter = new BankManagerAdapter(
                streamBankManifest,
                streamSoundManifest,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes,
                mockEvents
            );

            await adapter.loadBank('stream_bank' as BankId);
            expect(adapter.getStreamManifest('/assets/stream.json')).toBeDefined();

            adapter.unloadBank('stream_bank' as BankId);

            expect(mockRouter.stop).toHaveBeenCalledWith('stream_sound', { allowTail: false });
            expect(mockLoader.purgeUrls).toHaveBeenCalledWith([]);
            expect(adapter.getStreamManifest('/assets/stream.json')).toBeUndefined();
            expect(adapter.getBankState('stream_bank' as BankId)).toBe('UNLOADED');
            expect(mockEvents.onUnload).toHaveBeenCalledWith('stream_bank');
        });
    });

    describe('Edge Cases & 100% Branch Coverage', () => {
        it('should handle getStreamManifest with empty array', () => {
            const adapter = createAdapter();
            expect(adapter.getStreamManifest([])).toBeUndefined();
            expect(adapter.getStreamManifest(['/assets/stream.json'])).toBeUndefined();
        });

        it('should return Ok immediately if bank is in LOADING state', async () => {
            const adapter = createAdapter();
            (adapter as any).states.set('bank_1', 'LOADING');
            const result = await adapter.loadBank('bank_1' as BankId);
            expect(result.ok).toBe(true);
            expect(mockLoader.loadBatch).not.toHaveBeenCalled();
        });

        it('should handle totalItems === 0 when events is defined and undefined', async () => {
            const emptyAdapter = createAdapter();
            const result = await emptyAdapter.loadBank('empty_bank' as BankId);
            expect(result.ok).toBe(true);
            expect(emptyAdapter.getBankState('empty_bank' as BankId)).toBe('LOADED');
            expect(mockEvents.onComplete).toHaveBeenCalledWith([], 0);

            const adapterNoEvents = new BankManagerAdapter(
                bankManifest,
                soundManifest,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes
            );
            const resultNoEvents = await adapterNoEvents.loadBank('empty_bank' as BankId);
            expect(resultNoEvents.ok).toBe(true);
            expect(adapterNoEvents.getBankState('empty_bank' as BankId)).toBe('LOADED');
        });

        it('should skip sound during loadBank when sound url is an empty array', async () => {
            const customBank: IBankManifest = {
                ['b_empty_url' as BankId]: { id: 'b_empty_url' as BankId, sounds: ['s_empty' as SoundId] }
            };
            const customSound: ISpriteSoundManifest = {
                ['s_empty' as SoundId]: { url: [] }
            };
            const adapter = new BankManagerAdapter(
                customBank,
                customSound,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes,
                mockEvents
            );
            const result = await adapter.loadBank('b_empty_url' as BankId);
            expect(result.ok).toBe(true);
            expect(adapter.getBankState('b_empty_url' as BankId)).toBe('LOADED');
        });

        it('should handle expectedSizeMb calculation when URL produces empty or missing fileName', async () => {
            const customBank: IBankManifest = {
                ['b_root_url' as BankId]: {
                    id: 'b_root_url' as BankId,
                    sounds: ['s_root' as SoundId, 's_empty_str' as SoundId]
                }
            };
            const customSound: ISpriteSoundManifest = {
                ['s_root' as SoundId]: { url: '/' },
                ['s_empty_str' as SoundId]: { url: '' }
            };
            const adapter = new BankManagerAdapter(
                customBank,
                customSound,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes,
                mockEvents
            );
            await adapter.loadBank('b_root_url' as BankId);
            expect(mockLoader.loadBatch).toHaveBeenCalledWith(
                {
                    s_root: { url: '/', priority: 'low', expectedSizeMb: 5.0 },
                    s_empty_str: { url: '', priority: 'low', expectedSizeMb: 5.0 }
                },
                expect.any(Function),
                expect.any(Function)
            );
        });

        it('should skip fetch when stream manifest is already cached across multiple banks', async () => {
            const multiBankManifest: IBankManifest = {
                ['bank_a' as BankId]: { id: 'bank_a' as BankId, sounds: ['shared_stream' as SoundId] },
                ['bank_b' as BankId]: { id: 'bank_b' as BankId, sounds: ['shared_stream' as SoundId] }
            };
            const multiSoundManifest: ISpriteSoundManifest = {
                ['shared_stream' as SoundId]: { url: '/assets/shared.json' }
            };
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ isLooping: true, chunks: [] })
            });
            globalThis.fetch = fetchMock;

            const adapter = new BankManagerAdapter(
                multiBankManifest,
                multiSoundManifest,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes,
                mockEvents
            );

            await adapter.loadBank('bank_a' as BankId);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            await adapter.loadBank('bank_b' as BankId);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(adapter.getBankState('bank_b' as BankId)).toBe('LOADED');
        });

        it('should handle failedItems inside loadBatch without throwing, transitioning to ERROR', async () => {
            mockLoader.loadBatch.mockImplementation(
                (_urls: unknown, _onProg: unknown, onError: (key: string, err: Error) => void) => {
                    onError('s1', new Error('Sound decode error'));
                    return Promise.resolve({});
                }
            );

            const adapter = createAdapter();
            const result = await adapter.loadBank('bank_1' as BankId);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error.message).toContain('Failed to load bank bank_1: s1');
            }
            expect(adapter.getBankState('bank_1' as BankId)).toBe('ERROR');
        });

        it('should handle non-Error throw during loadBatch in catch block', async () => {
            mockLoader.loadBatch.mockRejectedValue('String error rejection');

            const adapter = createAdapter();
            const result = await adapter.loadBank('bank_1' as BankId);
            expect(result.ok).toBe(false);
            if (!result.ok) {
                expect(result.error).toBeInstanceOf(Error);
                expect(result.error.message).toBe('String error rejection');
            }
            expect(adapter.getBankState('bank_1' as BankId)).toBe('ERROR');
        });

        it('should handle unloadBank with stream sounds having array URLs and empty array URLs', () => {
            const customBank: IBankManifest = {
                ['b_streams' as BankId]: {
                    id: 'b_streams' as BankId,
                    sounds: ['s_arr' as SoundId, 's_empty_arr' as SoundId]
                }
            };
            const customSound: ISpriteSoundManifest = {
                ['s_arr' as SoundId]: { url: ['/streams/stream1.json'] },
                ['s_empty_arr' as SoundId]: { url: [], isStream: true }
            };
            const adapter = new BankManagerAdapter(
                customBank,
                customSound,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes,
                mockEvents
            );

            (adapter as any).streamManifests.set('/streams/stream1.json', { isLooping: true, chunks: [] });
            expect(adapter.getStreamManifest('/streams/stream1.json')).toBeDefined();

            adapter.unloadBank('b_streams' as BankId);

            expect(adapter.getStreamManifest('/streams/stream1.json')).toBeUndefined();
            expect(adapter.getBankState('b_streams' as BankId)).toBe('UNLOADED');
        });

        it('should classify stream sound with array of .json URLs and query string', () => {
            const customBank: IBankManifest = {
                ['b_array_stream' as BankId]: {
                    id: 'b_array_stream' as BankId,
                    sounds: ['s_arr_json' as SoundId, 's_arr_query' as SoundId]
                }
            };
            const customSound: ISpriteSoundManifest = {
                ['s_arr_json' as SoundId]: { url: ['/manifest.json'] },
                ['s_arr_query' as SoundId]: { url: '/manifest.json?v=1' }
            };
            const adapter = new BankManagerAdapter(
                customBank,
                customSound,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes
            );

            expect((adapter as any).isStreamSound(customSound['s_arr_json' as SoundId])).toBe(true);
            expect((adapter as any).isStreamSound(customSound['s_arr_query' as SoundId])).toBe(true);
            expect((adapter as any).isStreamSound({ url: [] })).toBe(false);
            expect((adapter as any).isStreamSound({ url: ['/sound.mp3'] })).toBe(false);
        });

        it('should execute loadBank and unloadBank smoothly when events listener is omitted', async () => {
            const mixedBankManifest: IBankManifest = {
                ['b_no_events' as BankId]: {
                    id: 'b_no_events' as BankId,
                    sounds: ['s1' as SoundId, 'stream1' as SoundId]
                }
            };
            const mixedSoundManifest: ISpriteSoundManifest = {
                ['s1' as SoundId]: { url: 'url1' },
                ['stream1' as SoundId]: { url: '/stream.json' }
            };

            globalThis.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ isLooping: false, chunks: [] })
            });
            mockLoader.loadBatch.mockImplementation(
                (_urls: unknown, onProgress: (loaded: number, total: number, lastKey: string) => void) => {
                    onProgress(1, 1, 's1');
                    return Promise.resolve({});
                }
            );

            const adapter = new BankManagerAdapter(
                mixedBankManifest,
                mixedSoundManifest,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes
            );

            const loadResult = await adapter.loadBank('b_no_events' as BankId);
            expect(loadResult.ok).toBe(true);
            expect(adapter.getBankState('b_no_events' as BankId)).toBe('LOADED');

            adapter.unloadBank('b_no_events' as BankId);
            expect(adapter.getBankState('b_no_events' as BankId)).toBe('UNLOADED');
        });

        it('should handle loadBank when error occurs and events listener is omitted', async () => {
            const failBank: IBankManifest = {
                ['b_fail_no_events' as BankId]: { id: 'b_fail_no_events' as BankId, sounds: ['stream_fail' as SoundId] }
            };
            const failSound: ISpriteSoundManifest = {
                ['stream_fail' as SoundId]: { url: '/fail.json' }
            };
            globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

            const adapter = new BankManagerAdapter(
                failBank,
                failSound,
                mockLoader,
                mockPool,
                mockRouter,
                mockPrecalculatedSizes
            );

            const result = await adapter.loadBank('b_fail_no_events' as BankId);
            expect(result.ok).toBe(false);
            expect(adapter.getBankState('b_fail_no_events' as BankId)).toBe('ERROR');
        });
    });
});
