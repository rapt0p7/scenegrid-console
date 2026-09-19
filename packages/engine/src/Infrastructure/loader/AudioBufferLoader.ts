// noinspection D
import type AudioContextManager from '@infrastructure/context/AudioContextManager.js';
import type { IAudioBufferLoader, IAudioBufferRequest } from '@infrastructure/types/IAudioBufferLoader.js';

import { ConcurrencyThrottler, Result, Ok, Err } from '@scene-grid/shared';

type Extension = 'mp3' | 'ogg' | 'wav' | 'm4a';

export class AudioBufferLoader implements IAudioBufferLoader {
    private static readonly mimeMap: Record<Extension, string> = {
        mp3: 'audio/mpeg',
        ogg: 'audio/ogg',
        wav: 'audio/wav',
        m4a: 'audio/mp4'
    };
    #contextManager: AudioContextManager;
    #throttler: ConcurrencyThrottler<Result<AudioBuffer, Error>>;
    #inFlightPromises: Map<string, Promise<Result<AudioBuffer, Error>>> = new Map();

    readonly #maxCapacity: number;
    readonly #ramQuotaMb: number;
    readonly #onEmergencyEviction?: (url: string) => void;
    #currentRamMb: number = 0;

    readonly #bufferPool: (AudioBuffer | null)[];
    readonly #bufferSizes: Float32Array;
    readonly #priorities: Uint8Array;
    readonly #next: Int32Array;
    readonly #prev: Int32Array;
    readonly #indexToUrl: string[];
    #urlToIndex: Map<string, number> = new Map();

    readonly #freeIndices: Int32Array;
    #freeIndexHead: number;

    #headLow: number = -1;
    #tailLow: number = -1;
    #headHigh: number = -1;
    #tailHigh: number = -1;

    constructor(
        contextManager: AudioContextManager,
        concurrencyLimit: number = 6,
        maxQueueSize: number = 1024,
        ramQuotaMb: number = 50,
        onEmergencyEviction?: (url: string) => void
    ) {
        this.#contextManager = contextManager;
        this.#throttler = new ConcurrencyThrottler<Result<AudioBuffer, Error>>(concurrencyLimit, maxQueueSize);
        this.#maxCapacity = maxQueueSize;
        this.#ramQuotaMb = ramQuotaMb;
        this.#onEmergencyEviction = onEmergencyEviction;

        // oxlint-disable-next-line unicorn/no-new-array typescript/no-unsafe-assignment
        this.#bufferPool = new Array(maxQueueSize).fill(null);
        this.#bufferSizes = new Float32Array(maxQueueSize);
        this.#priorities = new Uint8Array(maxQueueSize);
        this.#next = new Int32Array(maxQueueSize).fill(-1);
        this.#prev = new Int32Array(maxQueueSize).fill(-1);
        // oxlint-disable-next-line unicorn/no-new-array typescript/no-unsafe-assignment
        this.#indexToUrl = new Array(maxQueueSize).fill('');
        this.#freeIndices = new Int32Array(maxQueueSize);

        for (let i = 0; i < maxQueueSize; i++) {
            this.#freeIndices[i] = i;
        }
        this.#freeIndexHead = maxQueueSize - 1;
    }

    public async load(request: IAudioBufferRequest): Promise<Result<AudioBuffer, Error>> {
        const resolvedUrl = this.resolveFirstSupportedUrl(request.url);

        const existingIdx = this.#urlToIndex.get(resolvedUrl);
        if (existingIdx !== undefined) {
            this.#updateMRU(existingIdx);
            return Ok(this.#bufferPool[existingIdx]!);
        }

        const inFlight = this.#inFlightPromises.get(resolvedUrl);
        if (inFlight !== undefined) {
            return inFlight;
        }

        this.#evictFor(request.expectedSizeMb);
        if (this.#freeIndexHead < 0) {
            this.#forceEvictOne();
        }

        const loadPromise = this.#throttler.enqueue(() => this.performLoad(resolvedUrl));
        this.#inFlightPromises.set(resolvedUrl, loadPromise);

        try {
            const result = await loadPromise;

            if (result.ok && !this.#urlToIndex.has(resolvedUrl)) {
                this.#evictFor(request.expectedSizeMb);
                if (this.#freeIndexHead < 0) this.#forceEvictOne();

                const idx = this.#freeIndices[this.#freeIndexHead--];
                const priorityNum = request.priority === 'high' ? 1 : 0;

                this.#bufferPool[idx] = result.value;
                this.#bufferSizes[idx] = request.expectedSizeMb;
                this.#priorities[idx] = priorityNum;
                this.#indexToUrl[idx] = resolvedUrl;
                this.#urlToIndex.set(resolvedUrl, idx);
                this.#currentRamMb += request.expectedSizeMb;

                this.#pushToHead(idx, priorityNum);
            }

            return result;
        } finally {
            this.#inFlightPromises.delete(resolvedUrl);
        }
    }

    public async loadBatch(
        resources: Record<string, IAudioBufferRequest>,
        onProgress?: (loadedItems: number, totalItems: number, lastKey: string) => void,
        onError?: (key: string, error: unknown) => void
    ): Promise<Record<string, AudioBuffer>> {
        const entries = Object.entries(resources);
        const totalItems = entries.length;
        let loadedItems = 0;
        const results: Record<string, AudioBuffer> = {};

        if (totalItems === 0) return results;

        const loadPromises = entries.map(async ([key, request]) => {
            const result = await this.load(request);

            if (result.ok) {
                results[key] = result.value;
            } else {
                if (onError !== undefined) onError(key, result.error);
            }

            loadedItems++;
            if (onProgress !== undefined) onProgress(loadedItems, totalItems, key);
        });

        await Promise.allSettled(loadPromises);

        return results;
    }

    public clearCache(url?: string): void {
        if (url === undefined) {
            this.#urlToIndex.clear();
            this.#bufferPool.fill(null);
            this.#indexToUrl.fill('');
            this.#next.fill(-1);
            this.#prev.fill(-1);

            this.#headLow = -1;
            this.#tailLow = -1;
            this.#headHigh = -1;
            this.#tailHigh = -1;
            this.#currentRamMb = 0;

            for (let i = 0; i < this.#maxCapacity; i++) {
                this.#freeIndices[i] = i;
            }
            this.#freeIndexHead = this.#maxCapacity - 1;
        } else {
            const idx = this.#urlToIndex.get(url);
            if (idx !== undefined) {
                this.#freeIndex(idx);
            }
        }
    }

    public getBuffer(url: string | readonly string[]): AudioBuffer | undefined {
        const resolvedUrl = this.resolveFirstSupportedUrl(url);
        const idx = this.#urlToIndex.get(resolvedUrl);

        if (idx !== undefined) {
            this.#updateMRU(idx);
            return this.#bufferPool[idx]!;
        }

        return undefined;
    }

    public purgeUrls(urls: (string | readonly string[])[]): void {
        for (const url of urls) {
            const resolvedUrl = this.resolveFirstSupportedUrl(url);
            const idx = this.#urlToIndex.get(resolvedUrl);
            if (idx !== undefined) {
                this.#freeIndex(idx);
            }
        }
    }

    public getCurrentRam(): number {
        return this.#currentRamMb;
    }

    #evictFor(requiredMb: number): void {
        while (this.#currentRamMb + requiredMb > this.#ramQuotaMb) {
            if (this.#tailLow !== -1) {
                this.#freeIndex(this.#tailLow);
            } else if (this.#tailHigh === -1) {
                break;
            } else {
                const url = this.#indexToUrl[this.#tailHigh];
                this.#freeIndex(this.#tailHigh);
                if (this.#onEmergencyEviction) {
                    this.#onEmergencyEviction(url);
                }
            }
        }
    }

    #forceEvictOne(): void {
        if (this.#tailLow !== -1) {
            this.#freeIndex(this.#tailLow);
        } else if (this.#tailHigh !== -1) {
            const url = this.#indexToUrl[this.#tailHigh];
            this.#freeIndex(this.#tailHigh);
            if (this.#onEmergencyEviction) {
                this.#onEmergencyEviction(url);
            }
        }
    }

    #freeIndex(idx: number): void {
        const priority = this.#priorities[idx];
        this.#snip(idx, priority);

        this.#currentRamMb -= this.#bufferSizes[idx];
        this.#urlToIndex.delete(this.#indexToUrl[idx]);

        this.#bufferPool[idx] = null;
        this.#indexToUrl[idx] = '';

        this.#freeIndices[++this.#freeIndexHead] = idx;
    }

    #updateMRU(idx: number): void {
        const priority = this.#priorities[idx];
        this.#snip(idx, priority);
        this.#pushToHead(idx, priority);
    }

    #snip(idx: number, priority: number): void {
        const prevIdx = this.#prev[idx];
        const nextIdx = this.#next[idx];

        if (prevIdx !== -1) {
            this.#next[prevIdx] = nextIdx;
        } else if (priority === 0) {
            this.#headLow = nextIdx;
        } else {
            this.#headHigh = nextIdx;
        }

        if (nextIdx !== -1) {
            this.#prev[nextIdx] = prevIdx;
        } else if (priority === 0) {
            this.#tailLow = prevIdx;
        } else {
            this.#tailHigh = prevIdx;
        }

        this.#next[idx] = -1;
        this.#prev[idx] = -1;
    }

    #pushToHead(idx: number, priority: number): void {
        this.#prev[idx] = -1;

        if (priority === 0) {
            this.#next[idx] = this.#headLow;
            if (this.#headLow !== -1) {
                this.#prev[this.#headLow] = idx;
            }
            this.#headLow = idx;
            if (this.#tailLow === -1) {
                this.#tailLow = idx;
            }
        } else {
            this.#next[idx] = this.#headHigh;
            if (this.#headHigh !== -1) {
                this.#prev[this.#headHigh] = idx;
            }
            this.#headHigh = idx;
            if (this.#tailHigh === -1) {
                this.#tailHigh = idx;
            }
        }
    }

    private async performLoad(url: string): Promise<Result<AudioBuffer, Error>> {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.warn(`[AudioBufferLoader] Network error ${response.status} for ${url}.`);
                return Err(new Error(`Network error ${response.status} for ${url}`));
            }

            const arrayBuffer = await response.arrayBuffer();
            const decoded = await this.#contextManager.context.decodeAudioData(arrayBuffer);
            return Ok(decoded);
        } catch (error) {
            console.error(`[AudioBufferLoader] Failed to load or decode ${url}.`, error);
            return Err(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private resolveFirstSupportedUrl(url: string | readonly string[]): string {
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
