import AudioContextFactory from '@infrastructure/context/AudioContextFactory.js';
import ListenerManager from '@infrastructure/context/ListenerManager.js';
import UnlockManager from '@infrastructure/context/UnlockManager.js';

import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type { AudioCtx } from '@infrastructure/types/IAudioContext.js';
import type { IAudioContextManager } from '@infrastructure/types/IAudioContextManager.js';

export default class AudioContextManager implements IAudioContextManager {
    readonly #context: AudioCtx;
    #unlocker: UnlockManager;
    #listener: ListenerManager | null = null;

    public onStateChange: ((state: AudioContextState) => void) | null = null;

    constructor(sampleRate?: number) {
        this.#context = AudioContextFactory.createRealtime(sampleRate);
        this.#unlocker = new UnlockManager(this.#context);

        this.#context.addEventListener('statechange', () => {
            if (this.onStateChange !== null) {
                this.onStateChange(this.#context.state);
            }
        });
    }

    get context(): AudioCtx {
        return this.#context;
    }

    get state(): AudioContextState {
        return this.#context.state;
    }

    get sampleRate(): number {
        return this.#context.sampleRate;
    }

    get currentTime(): number {
        return this.#context.currentTime;
    }

    public initSpatial(automation: AutomationEngine): void {
        this.#listener = new ListenerManager(this.#context, automation);
    }

    public setListenerPosition(x: number, y: number, z: number): void {
        if (this.#listener === null) {
            console.warn('[AudioContextManager] Spatial audio not initialized. Call initSpatial first.');
        } else {
            this.#listener.setPosition(x, y, z);
        }
    }

    // eslint-disable-next-line max-params
    public setListenerOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
        if (this.#listener === null) {
            console.warn('[AudioContextManager] Spatial audio not initialized. Call initSpatial first.');
        } else {
            this.#listener.setOrientation(fx, fy, fz, ux, uy, uz);
        }
    }

    async resume(): Promise<void> {
        await this.#unlocker.unlock();
    }

    async suspend(): Promise<void> {
        if (this.#context.state === 'running') {
            await this.#context.suspend();
        }
    }

    async close(): Promise<void> {
        if (this.#context.state !== 'closed') {
            await this.#context.close();
        }
    }
}
