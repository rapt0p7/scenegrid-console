import type { IBankManifest } from '@domain/Configuration/Ports/IBankConfig.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';

import { BankId, SoundId } from '@scene-grid/shared';
// oxlint-disable require-await
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
            // oxlint-disable-next-line unicorn/no-useless-undefined
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
});
