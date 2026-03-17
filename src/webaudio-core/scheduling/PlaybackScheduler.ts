import type AudioContextManager from '@webaudio-core/context/AudioContextManager';
import type { ISoundInstance } from '@webaudio-core/types/ISoundInstance';

interface ScheduledHandle {
    id: number;
    instance: ISoundInstance;
    startTime?: number;
    stopTime?: number;
}

export class PlaybackScheduler {
    #ctx: AudioContextManager;
    #idCounter = 0;
    #scheduled = new Map<number, ScheduledHandle>();

    constructor(contextManager: AudioContextManager) {
        this.#ctx = contextManager;
    }

    public schedulePlay(instance: ISoundInstance, delay: number = 0, offset: number = 0, duration?: number): number {
        const id = ++this.#idCounter;
        const when = this.#ctx.currentTime + delay;

        instance.play(when, offset, duration);

        this.#scheduled.set(id, {
            id,
            instance,
            startTime: when
        });

        const cleanup = instance.on('ended', () => {
            cleanup();
            this.#scheduled.delete(id);
        });

        return id;
    }

    public scheduleStop(instance: ISoundInstance, delay: number = 0): number {
        const id = ++this.#idCounter;
        const when = this.#ctx.currentTime + delay;

        instance.stop(when);

        this.#scheduled.set(id, {
            id,
            instance,
            stopTime: when
        });

        const cleanup = instance.on('ended', () => {
            cleanup();
            this.#scheduled.delete(id);
        });

        return id;
    }

    public cancel(id: number): void {
        const handle = this.#scheduled.get(id);
        if (!handle) return;

        handle.instance.cancelScheduled();

        this.#scheduled.delete(id);
    }

    public cancelAll(instance: ISoundInstance): void {
        for (const [id, handle] of this.#scheduled) {
            if (handle.instance === instance) {
                instance.cancelScheduled();
                this.#scheduled.delete(id);
            }
        }
    }

    public clearInstance(instance: ISoundInstance): void {
        for (const [id, handle] of this.#scheduled) {
            if (handle.instance === instance) {
                this.#scheduled.delete(id);
            }
        }
    }
}
