import type AudioContextManager from '@infrastructure/context/AudioContextManager.js';
import type { IAudioBufferLoader } from '@infrastructure/types/IAudioBufferLoader.js';

export class AudioBufferLoader implements IAudioBufferLoader {
    #contextManager: AudioContextManager;
    #bufferCache: Map<string, AudioBuffer> = new Map();
    #inFlightPromises: Map<string, Promise<AudioBuffer>> = new Map();

    constructor(contextManager: AudioContextManager) {
        this.#contextManager = contextManager;
    }

    public async load(url: string | string[]): Promise<AudioBuffer> {
        const resolvedUrl = this.resolveFirstSupportedUrl(url);

        const cachedBuffer = this.#bufferCache.get(resolvedUrl);

        if (cachedBuffer !== undefined) {
            return cachedBuffer;
        }

        const inFlight = this.#inFlightPromises.get(resolvedUrl);

        if (inFlight !== undefined) {
            return inFlight;
        }

        const loadPromise = this.performLoad(resolvedUrl);
        this.#inFlightPromises.set(resolvedUrl, loadPromise);

        try {
            const buffer = await loadPromise;
            this.#bufferCache.set(resolvedUrl, buffer);
            return buffer;
        } finally {
            this.#inFlightPromises.delete(resolvedUrl);
        }
    }

    public async loadBatch(
        resources: Record<string, string | string[]>,
        onProgress?: (loadedItems: number, totalItems: number, lastKey: string) => void,
        onError?: (key: string, error: unknown) => void
    ): Promise<Record<string, AudioBuffer>> {
        const entries = Object.entries(resources);
        const totalItems = entries.length;
        let loadedItems = 0;
        const results: Record<string, AudioBuffer> = {};

        if (totalItems === 0) return results;

        const loadPromises = entries.map(async ([key, url]) => {
            try {
                const buffer = await this.load(url);
                results[key] = buffer;
                loadedItems++;
                if (onProgress !== undefined) onProgress(loadedItems, totalItems, key);
            } catch (error) {
                loadedItems++;
                if (onError !== undefined) onError(key, error);
                if (onProgress !== undefined) onProgress(loadedItems, totalItems, key);
            }
        });

        await Promise.allSettled(loadPromises);

        return results;
    }

    public clearCache(url?: string): void {
        if (url === undefined) {
            this.#bufferCache.clear();
        } else {
            this.#bufferCache.delete(url);
        }
    }

    private async performLoad(url: string): Promise<AudioBuffer> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`AudioBufferLoader: network error ${response.status} for ${url}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            return await this.#contextManager.context.decodeAudioData(arrayBuffer);
        } catch (error) {
            throw new Error(`AudioBufferLoader: failed to load or decode ${url}`, { cause: error });
        }
    }

    private resolveFirstSupportedUrl(url: string | string[]): string {
        if (typeof url === 'string') return url;

        const audio = document.createElement('audio');
        const mimeMap: Record<string, string> = {
            mp3: 'audio/mpeg',
            ogg: 'audio/ogg',
            wav: 'audio/wav',
            m4a: 'audio/mp4'
        };

        for (const candidate of url) {
            const extension = candidate.split('.').pop()?.toLowerCase();

            if (extension === undefined) continue;

            const mime = mimeMap[extension];

            if (mime === undefined) continue;

            if (audio.canPlayType(mime) !== '') {
                return candidate;
            }
        }

        return url[0];
    }
}
