// noinspection D
import type AudioContextManager from '@infrastructure/context/AudioContextManager.js';
import type { IAudioBufferLoader } from '@infrastructure/types/IAudioBufferLoader.js';

type Extension = 'mp3' | 'ogg' | 'wav' | 'm4a';

export class AudioBufferLoader implements IAudioBufferLoader {
    private static readonly mimeMap: Record<Extension, string> = {
        mp3: 'audio/mpeg',
        ogg: 'audio/ogg',
        wav: 'audio/wav',
        m4a: 'audio/mp4'
    };
    #contextManager: AudioContextManager;
    #bufferCache: Map<string, AudioBuffer> = new Map();
    #inFlightPromises: Map<string, Promise<AudioBuffer>> = new Map();
    #dummyBuffer: AudioBuffer | null = null;

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
                console.warn(`[AudioBufferLoader] Network error ${response.status} for ${url}. Using dummy buffer.`);
                return this.getDummyBuffer();
            }

            const arrayBuffer = await response.arrayBuffer();
            return await this.#contextManager.context.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error(`[AudioBufferLoader] Failed to load or decode ${url}. Using dummy buffer.`, error);
            return this.getDummyBuffer();
        }
    }

    private getDummyBuffer(): AudioBuffer {
        if (!this.#dummyBuffer) {
            this.#dummyBuffer = this.#contextManager.context.createBuffer(
                1,
                1,
                this.#contextManager.context.sampleRate
            );
        }
        return this.#dummyBuffer;
    }

    private resolveFirstSupportedUrl(url: string | string[]): string {
        if (typeof url === 'string') return url;

        const audio = document.createElement('audio');

        for (const candidate of url) {
            const extension = candidate.split('.').pop()?.toLowerCase();

            if (extension === undefined) continue;

            const mime = AudioBufferLoader.mimeMap[extension as Extension];

            if (mime === undefined) continue;

            if (audio.canPlayType(mime) !== '') {
                return candidate;
            }
        }

        return url[0];
    }
}
