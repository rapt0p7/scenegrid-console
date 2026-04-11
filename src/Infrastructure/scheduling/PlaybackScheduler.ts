// noinspection D
import type AudioContextManager from '@infrastructure/context/AudioContextManager.js';
import type { ISoundInstance } from '@infrastructure/types/ISoundInstance.js';

export class PlaybackScheduler {
    readonly #ctx: AudioContextManager;
    readonly #activeHandles = new Map<number, number>();

    readonly #instanceRefs: Array<ISoundInstance | null>;
    readonly #startTimes: Float64Array;
    readonly #stopTimes: Float64Array;
    readonly #offCallbacks: Array<(() => void) | null>;

    readonly #capacity: number;
    #nextInternalId = 1;

    constructor(contextManager: AudioContextManager, capacity: number = 128) {
        this.#ctx = contextManager;
        this.#capacity = capacity;

        this.#instanceRefs = Array.from({ length: capacity }).fill(null) as null[];
        this.#offCallbacks = Array.from({ length: capacity }).fill(null) as null[];
        this.#startTimes = new Float64Array(capacity);
        this.#stopTimes = new Float64Array(capacity);
    }

    #onInstanceEnded = (instance: ISoundInstance): void => {
        const slot = this.#findSlotByInstance(instance);
        if (slot !== -1) {
            this.#cleanupSlot(slot);
        }
    };

    // eslint-disable-next-line max-params
    public schedulePlay(instance: ISoundInstance, delay: number = 0, offset: number = 0, duration?: number): number {
        const slot = this.#findFreeSlot();
        if (slot === -1) return -1;

        const id = this.#nextInternalId++;
        const when = this.#ctx.context.currentTime + delay;

        instance.play(when, offset, duration);

        this.#instanceRefs[slot] = instance;
        this.#startTimes[slot] = when;
        this.#activeHandles.set(id, slot);

        this.#offCallbacks[slot] = instance.on('ended', this.#onInstanceEnded);

        return id;
    }

    public scheduleStop(instance: ISoundInstance, delay: number = 0): number {
        const id = this.#nextInternalId++;
        const when = this.#ctx.context.currentTime + delay;

        instance.stop(delay);

        const existingSlot = this.#findSlotByInstance(instance);
        if (existingSlot !== -1) {
            this.#stopTimes[existingSlot] = when;
        }

        return id;
    }

    public cancel(id: number): void {
        const slot = this.#activeHandles.get(id);
        if (slot === undefined) return;

        const instance = this.#instanceRefs[slot];
        if (instance) {
            instance.cancelScheduled();
            this.#cleanupSlot(slot);
        }

        this.#activeHandles.delete(id);
    }

    public cancelAll(instance: ISoundInstance): void {
        for (let index = 0; index < this.#capacity; index++) {
            if (this.#instanceRefs[index] === instance) {
                instance.cancelScheduled();
                this.#cleanupSlot(index);
            }
        }
    }

    public clearInstance(instance: ISoundInstance): void {
        const slot = this.#findSlotByInstance(instance);
        if (slot !== -1) {
            this.#cleanupSlot(slot);
        }
    }

    #cleanupSlot(slot: number): void {
        const unsubscribe = this.#offCallbacks[slot];
        if (unsubscribe) {
            unsubscribe();
            this.#offCallbacks[slot] = null;
        }

        this.#instanceRefs[slot] = null;
        this.#startTimes[slot] = 0;
        this.#stopTimes[slot] = 0;

        for (const [id, s] of this.#activeHandles.entries()) {
            if (s === slot) {
                this.#activeHandles.delete(id);
                break;
            }
        }
    }

    #findFreeSlot(): number {
        for (let index = 0; index < this.#capacity; index++) {
            if (this.#instanceRefs[index] === null) return index;
        }
        return -1;
    }

    #findSlotByInstance(instance: ISoundInstance): number {
        for (let index = 0; index < this.#capacity; index++) {
            if (this.#instanceRefs[index] === instance) return index;
        }
        return -1;
    }
}
