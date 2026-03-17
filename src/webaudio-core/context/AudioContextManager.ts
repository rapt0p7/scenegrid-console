import AudioContextFactory from '@webaudio-core/context/AudioContextFactory';
import ListenerManager from '@webaudio-core/context/ListenerManager';
import UnlockManager from '@webaudio-core/context/UnlockManager';
import type { AutomationEngine } from '@webaudio-core/index';
import type { AudioCtx } from '@webaudio-core/types/IAudioContext';
import type { IAudioContextManager } from '@webaudio-core/types/IAudioContextManager';

export default class AudioContextManager implements IAudioContextManager {
    readonly #context: AudioCtx;
    #unlocker: UnlockManager;
    #listener: ListenerManager | null = null;

    constructor(sampleRate?: number) {
        this.#context = AudioContextFactory.createRealtime(sampleRate);
        this.#unlocker = new UnlockManager(this.#context);
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
        this.#listener!.setPosition(x, y, z);
    }

    public setListenerOrientation(fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
        this.#listener!.setOrientation(fx, fy, fz, ux, uy, uz);
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
