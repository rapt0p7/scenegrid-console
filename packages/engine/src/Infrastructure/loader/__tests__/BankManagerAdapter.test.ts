// oxlint-disable require-await
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BankManagerAdapter } from '../BankManagerAdapter.js';
import type { IBankManifest } from '@domain/Configuration/Ports/IBankConfig.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';
import { BankId, SoundId } from '@scene-grid/shared';

describe('BankManagerAdapter', () => {
    let mockLoader: any;
    let mockPool: any;
    let mockRouter: any;
    let mockEvents: any;

    const bankManifest: IBankManifest = {
        ['bank_1' as BankId]: { id: 'bank_1' as BankId, sounds: ['s1' as SoundId, 's2' as SoundId] },
        ['empty_bank' as BankId]: { id: 'empty_bank' as BankId, sounds: [] }
    };

    const soundManifest: ISpriteSoundManifest = {
        ['s1' as SoundId]: { url: 'url1' },
        ['s2' as SoundId]: { url: 'url2' }
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
    });

    function createAdapter() {
        return new BankManagerAdapter(bankManifest, soundManifest, mockLoader, mockPool, mockRouter, mockEvents);
    }

    describe('loadBank', () => {
        it('should change state to LOADED after successful batch load', async () => {
            const adapter = createAdapter();
            await adapter.loadBank('bank_1' as any);

            expect(adapter.getBankState('bank_1' as any)).toBe('LOADED');
            expect(mockLoader.loadBatch).toHaveBeenCalledWith(
                { s1: 'url1', s2: 'url2' },
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
            await expect(adapter.loadBank('bank_1' as any)).rejects.toThrow();

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

            expect(mockRouter.stop).toHaveBeenCalledTimes(2);
            expect(mockRouter.stop).toHaveBeenCalledWith('s1', { allowTail: false });
            expect(mockRouter.stop).toHaveBeenCalledWith('s2', { allowTail: false });

            expect(mockPool.purgeSound).toHaveBeenCalledTimes(2);
            expect(mockPool.purgeSound).toHaveBeenCalledWith('s1');
            expect(mockPool.purgeSound).toHaveBeenCalledWith('s2');

            expect(mockLoader.purgeUrls).toHaveBeenCalledTimes(1);
            expect(mockLoader.purgeUrls).toHaveBeenCalledWith(['url1', 'url2']);

            expect(adapter.getBankState(bankId)).toBe('UNLOADED');
            expect(mockEvents.onUnload).toHaveBeenCalledWith(bankId);
        });

        it('should do nothing if bankId is not in manifest', () => {
            const adapter = createAdapter();
            adapter.unloadBank('unknown' as any);
            expect(mockRouter.stop).not.toHaveBeenCalled();
        });
    });
});
