// noinspection D
import type AudioContextManager from '@infrastructure/context/AudioContextManager.js';
import type { ISoundInstance } from '@infrastructure/types/ISoundInstance.js';
import type { ContextTime, Seconds } from '@scene-grid/shared';

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
        this.#cleanupSlot(this.#findSlotByInstance(instance));
    };

    // eslint-disable-next-line max-params
    public schedulePlay(
        instance: ISoundInstance,
        targetTime: ContextTime = 0 as ContextTime,
        offset: Seconds = 0 as Seconds,
        duration?: Seconds
    ): number {
        const slot = this.#findFreeSlot();
        if (slot === -1) return -1;

        const id = this.#nextInternalId++;
        const when = (targetTime > 0 ? targetTime : this.#ctx.context.currentTime) as ContextTime;

        instance.play(when, offset, duration);

        this.#instanceRefs[slot] = instance;
        this.#startTimes[slot] = when;
        this.#activeHandles.set(id, slot);

        this.#offCallbacks[slot] = instance.on('ended', this.#onInstanceEnded);

        return id;
    }

    public scheduleStop(instance: ISoundInstance, targetTime: ContextTime = 0 as ContextTime): number {
        const id = this.#nextInternalId++;
        const when = (targetTime > 0 ? targetTime : this.#ctx.context.currentTime) as ContextTime;

        instance.stop(when);

        const existingSlot = this.#findSlotByInstance(instance);
        // stryker disable next-line ConditionalExpression: Equivalent mutant (TypedArray ignores negative index writes)
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
        this.#cleanupSlot(this.#findSlotByInstance(instance));
    }

    public getScheduledStopTime(instance: ISoundInstance): ContextTime | null {
        const slot = this.#findSlotByInstance(instance);
        return slot === -1 ? null : (this.#stopTimes[slot] as ContextTime);
    }

    // stryker disable next-line all: Defensive guard against slot index boundaries
    #cleanupSlot(slot: number): void {
        if (slot < 0 || slot >= this.#capacity) return;

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
        // stryker disable next-line EqualityOperator: Equivalent mutant (out-of-bounds Array access returns undefined !== null)
        for (let index = 0; index < this.#capacity; index++) {
            if (this.#instanceRefs[index] === null) return index;
        }
        return -1;
    }

    #findSlotByInstance(instance: ISoundInstance): number {
        // stryker disable next-line EqualityOperator: Equivalent mutant (out-of-bounds Array access returns undefined !== instance)
        for (let index = 0; index < this.#capacity; index++) {
            if (this.#instanceRefs[index] === instance) return index;
        }
        return -1;
    }
}
