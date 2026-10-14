// oxlint-disable unicorn/no-useless-undefined
// noinspection D

import type { IAudioBufferLoaderOptions } from '@domain/Configuration/Ports/IAudioBufferLoaderOptions.js';
import type { IBankManifest, BankState } from '@domain/Configuration/Ports/IBankConfig.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';
import type { IStreamManifest } from '@domain/Configuration/Ports/IStreamManifest.js';
import type { IAudioRouter } from '@domain/Router/Ports/IAudioRouter.js';
import type { IBankManager } from '@domain/Shared/Ports/IBankManager.js';
import type SoundPoolManager from '@infrastructure/instance/SoundPoolManager.js';
import type { AudioBufferLoader } from '@infrastructure/loader/AudioBufferLoader.js';
import type { IAudioBufferRequest } from '@infrastructure/types/IAudioBufferLoader.js';
import type { BankId, SoundId } from '@scene-grid/shared';

import { isDefined, Result, Ok, Err } from '@scene-grid/shared';

import { validateAudioUrl } from './AudioUrlValidator.js';

export interface IBankLoadEvents {
    readonly onStart: (totalItems: number) => void;
    readonly onProgress: (loadedItems: number, totalItems: number, progress: number, lastKey: string) => void;
    readonly onError: (key: string, error: unknown) => void;
    readonly onComplete: (failedItems: string[], durationMs: number) => void;
    readonly onUnload: (bankId: BankId) => void;
}

export class BankManagerAdapter implements IBankManager {
    private readonly states = new Map<BankId, BankState>();
    private readonly streamManifests = new Map<string, IStreamManifest>();

    constructor(
        private readonly bankManifest: IBankManifest,
        private readonly soundManifest: ISpriteSoundManifest,
        private readonly loader: AudioBufferLoader,
        private readonly pool: SoundPoolManager,
        private readonly router: IAudioRouter,
        private readonly precalculatedSizes: Record<string, number>,
        private readonly events?: IBankLoadEvents,
        private readonly options?: IAudioBufferLoaderOptions
    ) {}

    public getBankState(bankId: BankId): BankState {
        return this.states.get(bankId) ?? 'UNLOADED';
    }

    public getStreamManifest(url: string | readonly string[]): IStreamManifest | undefined {
        const key = this.getPrimaryUrl(url);
        if (typeof key !== 'string') return undefined;
        return this.streamManifests.get(key);
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

        const { bufferEntries, streamEntries } = this.collectSoundEntries(config.sounds);
        const totalItems = bufferEntries.length + streamEntries.length;

        if (totalItems === 0) {
            this.states.set(bankId, 'LOADED');
            this.events?.onComplete([], 0);
            return Ok(undefined);
        }

        this.events?.onStart(totalItems);
        const startTime = performance.now();
        const failedItems: string[] = [];
        let loadedCount = 0;

        const onItemSuccess = (key: string): void => {
            loadedCount++;
            this.events?.onProgress(loadedCount, totalItems, loadedCount / totalItems, key);
        };
        const onItemError = (key: string, error: unknown): void => {
            failedItems.push(key);
            this.events?.onError(key, error);
        };

        const loadPromises: Promise<unknown>[] = [];

        if (bufferEntries.length > 0) {
            loadPromises.push(this.createBufferBatchPromise(bufferEntries, onItemSuccess, onItemError));
        }

        for (const [soundId, url] of streamEntries) {
            loadPromises.push(this.loadStreamEntry(soundId, url, onItemSuccess, onItemError));
        }

        try {
            await Promise.all(loadPromises);

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
            this.unloadSound(soundId, urlsToPurge);
        }
        this.loader.purgeUrls(urlsToPurge);

        this.states.set(bankId, 'UNLOADED');

        this.events?.onUnload(bankId);
    }

    private unloadSound(soundId: SoundId, urlsToPurge: (string | readonly string[])[]): void {
        const soundMeta = this.soundManifest[soundId];
        if (!isDefined(soundMeta)) return;

        if (!this.isStreamSound(soundMeta)) {
            urlsToPurge.push(soundMeta.url);
            return;
        }

        const primaryUrl = this.getPrimaryUrl(soundMeta.url);
        if (typeof primaryUrl === 'string') {
            this.streamManifests.delete(primaryUrl);
        }
    }

    private collectSoundEntries(sounds: readonly SoundId[]): {
        readonly bufferEntries: [string, IAudioBufferRequest][];
        readonly streamEntries: [string, string][];
    } {
        const bufferEntries: [string, IAudioBufferRequest][] = [];
        const streamEntries: [string, string][] = [];

        for (const soundId of sounds) {
            const soundMeta = this.soundManifest[soundId];
            if (!isDefined(soundMeta)) continue;

            const primaryUrl = this.getPrimaryUrl(soundMeta.url);
            if (typeof primaryUrl !== 'string') continue;

            if (this.isStreamSound(soundMeta)) {
                streamEntries.push([soundId, primaryUrl]);
            } else {
                bufferEntries.push([soundId, this.createBufferRequest(soundMeta, primaryUrl)]);
            }
        }

        return { bufferEntries, streamEntries };
    }

    private createBufferRequest(soundMeta: ISpriteSoundManifest[SoundId], primaryUrl: string): IAudioBufferRequest {
        const fileName = primaryUrl.split('/').pop()?.split('.')[0];
        const expectedSize =
            fileName !== undefined && fileName.length > 0 ? (this.precalculatedSizes[fileName] ?? 5.0) : 5.0;

        return {
            url: soundMeta.url,
            priority: soundMeta.priority ?? 'low',
            expectedSizeMb: expectedSize
        };
    }

    private createBufferBatchPromise(
        bufferEntries: readonly [string, IAudioBufferRequest][],
        onSuccess: (key: string) => void,
        onError: (key: string, error: unknown) => void
    ): Promise<Record<string, AudioBuffer>> {
        const urlsToLoad: Record<string, IAudioBufferRequest> = {};
        for (const [key, request] of bufferEntries) {
            urlsToLoad[key] = request;
        }

        return this.loader.loadBatch(
            urlsToLoad,
            (_loaded, _total, lastKey) => {
                onSuccess(lastKey);
            },
            onError
        );
    }

    private async loadStreamEntry(
        soundId: string,
        url: string,
        onSuccess: (key: string) => void,
        onError: (key: string, error: unknown) => void
    ): Promise<void> {
        try {
            await this.fetchAndCacheStreamManifest(url);
            onSuccess(soundId);
        } catch (error) {
            onError(soundId, error);
        }
    }

    private async fetchAndCacheStreamManifest(url: string): Promise<void> {
        const validation = validateAudioUrl(url, this.options);
        if (!validation.ok) {
            throw validation.error;
        }

        if (this.streamManifests.has(url)) {
            return;
        }

        const response = await fetch(validation.value);
        if (!response.ok) {
            throw new Error(`Failed to load stream manifest: ${url}`);
        }

        const manifest = (await response.json()) as IStreamManifest;
        this.streamManifests.set(url, manifest);
    }

    private getPrimaryUrl(url: string | readonly string[]): string | undefined {
        return typeof url === 'string' ? url : url[0];
    }

    private isStreamSound(soundMeta: ISpriteSoundManifest[SoundId]): boolean {
        if (soundMeta.isStream === true) return true;
        const url = this.getPrimaryUrl(soundMeta.url);
        return typeof url === 'string' && /\.json($|\?)/u.test(url);
    }
}
