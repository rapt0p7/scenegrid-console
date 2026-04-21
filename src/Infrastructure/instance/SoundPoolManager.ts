// noinspection D

import mitt from 'mitt';

import type { SoundId } from '@shared/Types/Branded.js';
import type { ISoundInstance, ISoundConfig } from '@infrastructure/types/ISoundInstance.js';
import type { IVoiceConfig } from '@infrastructure/types/IVoiceConfig.js';
import type { Emitter } from 'mitt';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type PoolEvents = {
    released: ISoundInstance;
};

export type PoolPolicy = 'expand' | 'steal_oldest';

export interface PoolConfig {
    maxPolyphony: number;
    policy: PoolPolicy;
    globalVoiceLimit: number;
    voiceConfigResolver: (soundId: SoundId) => IVoiceConfig | undefined;
    soundConfigResolver?: (soundId: SoundId) => ISoundConfig;
}

export default class SoundPoolManager {
    public readonly events: Emitter<PoolEvents> = mitt<PoolEvents>();
    readonly #allInstances: ISoundInstance[];
    readonly #freeStack: Uint16Array;
    #stackPtr: number;
    readonly #activeIndices: Set<number> = new Set();
    readonly #config: PoolConfig;
    readonly #instanceFactory: (soundId: SoundId) => ISoundInstance;

    constructor(instanceFactory: (soundId: SoundId) => ISoundInstance, config: Partial<PoolConfig> = {}) {
        this.#instanceFactory = instanceFactory;
        this.#config = {
            maxPolyphony: config.maxPolyphony ?? 32,
            policy: config.policy ?? 'steal_oldest',
            globalVoiceLimit: config.globalVoiceLimit ?? 32,
            // oxlint-disable-next-line unicorn/no-useless-undefined
            voiceConfigResolver: config.voiceConfigResolver ?? (() => undefined)
        };

        const size = this.#config.globalVoiceLimit;
        this.#allInstances = Array.from({ length: size });
        this.#freeStack = new Uint16Array(size);
        this.#stackPtr = size - 1;

        for (let index = 0; index < size; index++) {
            const inst = this.#instanceFactory('__RESERVED__' as SoundId);
            (inst as any)._poolIndex = index;
            this.#allInstances[index] = inst;
            this.#freeStack[index] = index;
        }
    }

    public get globalVoiceLimit(): number {
        return this.#config.globalVoiceLimit;
    }

    public acquire(soundId: SoundId, buffer: AudioBuffer): ISoundInstance | null {
        const voiceConfig = this.#config.voiceConfigResolver(soundId);
        const priority = voiceConfig?.priority ?? 128;

        const activeForId = this.#getActiveIndicesById(soundId);
        if (activeForId.length >= this.#config.maxPolyphony) {
            if (this.#config.policy === 'steal_oldest') {
                this.release(this.#allInstances[activeForId[0]]);
            } else {
                return null;
            }
        }

        if (this.#stackPtr < 0) {
            const victimIndex = this.#findStealCandidate(priority);

            if (victimIndex === -1) {
                console.warn(`[Pool] Rejected "${soundId}": No victims with lower priority.`);
                return null;
            }

            this.release(this.#allInstances[victimIndex]);
        }

        const index = this.#freeStack[this.#stackPtr--];
        const instance = this.#allInstances[index];
        const soundConfig = this.#config.soundConfigResolver?.(soundId);

        instance.rebind(soundId, buffer, soundConfig);
        instance.resetForReuse();

        this.#activeIndices.add(index);

        const off = instance.on('ended', () => {
            off();
            this.release(instance);
        });

        return instance;
    }

    public release(instance: ISoundInstance): void {
        const index = (instance as any)._poolIndex;

        if (!this.#activeIndices.has(index)) return;

        this.#activeIndices.delete(index);

        instance.stop();

        this.#freeStack[++this.#stackPtr] = index;

        this.events.emit('released', instance);
    }

    public getActiveVoices(): ISoundInstance[] {
        const result: ISoundInstance[] = [];
        for (const index of this.#activeIndices) {
            result.push(this.#allInstances[index]);
        }
        return result;
    }

    public dispose(soundId?: SoundId): void {
        for (const index of this.#activeIndices) {
            const inst = this.#allInstances[index];
            if (!soundId || inst.id === soundId) {
                this.release(inst);
            }
        }

        if (!soundId) {
            for (const inst of this.#allInstances) inst.dispose();
            this.#activeIndices.clear();
            this.#stackPtr = -1;
        }
    }

    #getActiveIndicesById(soundId: SoundId): number[] {
        const found: number[] = [];
        for (const index of this.#activeIndices) {
            if (this.#allInstances[index].id === soundId) found.push(index);
        }
        return found;
    }

    #findStealCandidate(requestedPriority: number): number {
        let weakestIndex = -1;
        let weakestPriority = -1;

        for (const index of this.#activeIndices) {
            const inst = this.#allInstances[index];
            if (inst.state === 'virtual') continue;

            const p = this.#config.voiceConfigResolver(inst.id)?.priority ?? 128;

            if (p > weakestPriority) {
                weakestPriority = p;
                weakestIndex = index;
            }
        }

        return weakestPriority >= requestedPriority ? weakestIndex : -1;
    }
}
