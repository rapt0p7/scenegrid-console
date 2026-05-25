import type { IBankManager } from '@domain/Shared/Ports/IBankManager.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { BankId } from '@shared/Types/Branded.js';
import type { IBankManifest, BankState } from '@domain/Configuration/Ports/IBankConfig.js';
import type { AudioBufferLoader } from '@infrastructure/loader/AudioBufferLoader.js';
import type SoundPoolManager from '@infrastructure/instance/SoundPoolManager.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';
import { isDefined } from '@shared/guards.js';

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
        private readonly events?: IBankLoadEvents
    ) {}

    public getBankState(bankId: BankId): BankState {
        return this.states.get(bankId) ?? 'UNLOADED';
    }

    // oxlint-disable-next-line max-lines-per-function
    public async loadBank(bankId: BankId): Promise<void> {
        const currentState = this.getBankState(bankId);
        if (currentState === 'LOADED' || currentState === 'LOADING') return;

        const config = this.bankManifest[bankId as string];
        if (!isDefined(config)) {
            console.warn(`[BankManager] Bank "${bankId}" not found in manifest.`);
            return;
        }

        this.states.set(bankId, 'LOADING');

        const entries: [string, string | string[]][] = [];
        for (const soundId of config.sounds) {
            const soundMeta = this.soundManifest[soundId];
            if (isDefined(soundMeta)) {
                entries.push([soundId as string, soundMeta.url]);
            }
        }

        const totalItems = entries.length;

        if (totalItems === 0) {
            this.states.set(bankId, 'LOADED');
            this.events?.onComplete([], 0);
            return;
        }

        this.events?.onStart(totalItems);
        const startTime = performance.now();
        const failedItems: string[] = [];

        const urlsToLoad: Record<string, string | string[]> = {};
        for (const [key, url] of entries) {
            urlsToLoad[key] = url;
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

            this.states.set(bankId, 'LOADED');
        } catch (error) {
            this.states.set(bankId, 'ERROR');
            throw error;
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

        const urlsToPurge: (string | string[])[] = [];
        for (const soundId of config.sounds) {
            const soundMeta = this.soundManifest[soundId];
            if (isDefined(soundMeta)) urlsToPurge.push(soundMeta.url);
        }
        this.loader.purgeUrls(urlsToPurge);

        this.states.set(bankId, 'UNLOADED');

        this.events?.onUnload(bankId);
    }
}
