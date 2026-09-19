// oxlint-disable unicorn/no-useless-undefined
// noinspection D

import type { IBankManifest, BankState } from '@domain/Configuration/Ports/IBankConfig.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IBankManager } from '@domain/Shared/Ports/IBankManager.js';
import type SoundPoolManager from '@infrastructure/instance/SoundPoolManager.js';
import type { AudioBufferLoader } from '@infrastructure/loader/AudioBufferLoader.js';
import type { IAudioBufferRequest } from '@infrastructure/types/IAudioBufferLoader.js';
import type { BankId } from '@scene-grid/shared';

import { isDefined, Result, Ok, Err } from '@scene-grid/shared';

export interface IBankLoadEvents {
    readonly onStart: (totalItems: number) => void;
    readonly onProgress: (loadedItems: number, totalItems: number, progress: number, lastKey: string) => void;
    readonly onError: (key: string, error: unknown) => void;
    readonly onComplete: (failedItems: string[], durationMs: number) => void;
    readonly onUnload: (bankId: BankId) => void;
}

export class BankManagerAdapter implements IBankManager {
    private readonly states = new Map<BankId, BankState>();

    constructor(
        private readonly bankManifest: IBankManifest,
        private readonly soundManifest: ISpriteSoundManifest,
        private readonly loader: AudioBufferLoader,
        private readonly pool: SoundPoolManager,
        private readonly router: IAudioRouter,
        private readonly precalculatedSizes: Record<string, number>,
        private readonly events?: IBankLoadEvents
    ) {}

    public getBankState(bankId: BankId): BankState {
        return this.states.get(bankId) ?? 'UNLOADED';
    }

    // oxlint-disable-next-line max-lines-per-function
    public async loadBank(bankId: BankId): Promise<Result<void, Error>> {
        const currentState = this.getBankState(bankId);
        if (currentState === 'LOADED' || currentState === 'LOADING') return Ok(undefined);

        const config = this.bankManifest[bankId as string];
        if (!isDefined(config)) {
            console.warn(`[BankManager] Bank "${bankId}" not found in manifest.`);
            return Err(new Error(`Bank "${bankId}" not found in manifest.`));
        }

        this.states.set(bankId, 'LOADING');

        const entries: [string, IAudioBufferRequest][] = [];
        for (const soundId of config.sounds) {
            const soundMeta = this.soundManifest[soundId];
            if (isDefined(soundMeta)) {
                const url: string = Array.isArray(soundMeta.url) ? soundMeta.url[0] : soundMeta.url;
                const fileName = url?.split?.('/')?.pop?.()?.split('.')[0];
                entries.push([
                    soundId,
                    {
                        url: soundMeta.url,
                        priority: soundMeta.priority ?? 'low',
                        expectedSizeMb: fileName ? (this.precalculatedSizes[fileName] ?? 5.0) : 5.0
                    }
                ]);
            }
        }

        const totalItems = entries.length;

        if (totalItems === 0) {
            this.states.set(bankId, 'LOADED');
            this.events?.onComplete([], 0);
            return Ok(undefined);
        }

        this.events?.onStart(totalItems);
        const startTime = performance.now();
        const failedItems: string[] = [];

        const urlsToLoad: Record<string, IAudioBufferRequest> = {};
        for (const [key, request] of entries) {
            urlsToLoad[key] = request;
        }

        try {
            await this.loader.loadBatch(
                urlsToLoad,
                (loaded, total, lastKey) => {
                    this.events?.onProgress(loaded, total, loaded / total, lastKey);
                },
                (key, error) => {
                    failedItems.push(key);
                    this.events?.onError(key, error);
                }
            );

            if (failedItems.length > 0) {
                this.states.set(bankId, 'ERROR');
                return Err(new Error(`Failed to load bank ${bankId}: ${failedItems.join(', ')}`));
            }

            this.states.set(bankId, 'LOADED');
            return Ok(undefined);
        } catch (error) {
            this.states.set(bankId, 'ERROR');
            return Err(error instanceof Error ? error : new Error(String(error)));
        } finally {
            this.events?.onComplete(failedItems, performance.now() - startTime);
        }
    }

    public unloadBank(bankId: BankId): void {
        const config = this.bankManifest[bankId as string];
        if (!isDefined(config)) return;

        for (const soundId of config.sounds) {
            this.router.stop(soundId, { allowTail: false });
        }

        for (const soundId of config.sounds) {
            this.pool.purgeSound(soundId);
        }

        const urlsToPurge: (string | readonly string[])[] = [];
        for (const soundId of config.sounds) {
            const soundMeta = this.soundManifest[soundId];
            if (isDefined(soundMeta)) urlsToPurge.push(soundMeta.url);
        }
        this.loader.purgeUrls(urlsToPurge);

        this.states.set(bankId, 'UNLOADED');

        this.events?.onUnload(bankId);
    }
}
