import type AudioContextManager from '@webaudio-core/context/AudioContextManager';
import type { IAudioBufferLoader } from '@webaudio-core/types/IAudioBufferLoader';

export class AudioBufferLoader implements IAudioBufferLoader {
    #contextManager: AudioContextManager;
    #bufferCache: Map<string, AudioBuffer> = new Map();
    #inFlightPromises: Map<string, Promise<AudioBuffer>> = new Map();

    constructor(contextManager: AudioContextManager) {
        this.#contextManager = contextManager;
    }

    public async load(url: string | string[]): Promise<AudioBuffer> {
        const resolvedUrl = this.resolveFirstSupportedUrl(url);

        if (this.#bufferCache.has(resolvedUrl)) {
            return this.#bufferCache.get(resolvedUrl)!;
        }

        if (this.#inFlightPromises.has(resolvedUrl)) {
            return this.#inFlightPromises.get(resolvedUrl)!;
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

    public clearCache(url?: string): void {
        if (url) {
            this.#bufferCache.delete(url);
        } else {
            this.#bufferCache.clear();
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
            const mime = extension ? mimeMap[extension] : null;
            if (!mime) continue;

            if (audio.canPlayType(mime) !== '') {
                return candidate;
            }
        }

        return url[0];
    }
}
