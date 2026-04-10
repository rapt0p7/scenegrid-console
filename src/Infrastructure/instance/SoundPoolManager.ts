// noinspection D

import type { SoundId } from '@domain/Types/Branded.js';
import type { ISoundInstance } from '@infrastructure/types/ISoundInstance.js';
import type { IVoiceConfig } from '@infrastructure/types/IVoiceConfig.js';

export type PoolPolicy = 'expand' | 'steal_oldest';

export interface PoolConfig {
    maxPolyphony: number;
    policy: PoolPolicy;
    globalVoiceLimit: number;
    voiceConfigResolver: (soundId: SoundId) => IVoiceConfig | undefined;
}

class SoundPoolManager {
    #available: Map<SoundId, ISoundInstance[]> = new Map();
    #busy: Map<SoundId, ISoundInstance[]> = new Map();
    #activeGlobalVoices: Set<ISoundInstance> = new Set();
    #config: PoolConfig;
    readonly #instanceFactory: (soundId: SoundId) => ISoundInstance;

    constructor(instanceFactory: (soundId: SoundId) => ISoundInstance, config: Partial<PoolConfig> = {}) {
        this.#instanceFactory = instanceFactory;
        this.#config = {
            maxPolyphony: config.maxPolyphony ?? 32,
            policy: config.policy ?? 'steal_oldest',
            globalVoiceLimit: config.globalVoiceLimit ?? 32,
            // eslint-disable-next-line unicorn/no-useless-undefined
            voiceConfigResolver: config.voiceConfigResolver ?? (() => undefined)
        };
    }

    public getActiveVoices(): ReadonlySet<ISoundInstance> {
        return this.#activeGlobalVoices;
    }

    public acquire(soundId: SoundId): ISoundInstance | null {
        const voiceConfig = this.#config.voiceConfigResolver(soundId);
        const requestedPriority = voiceConfig?.priority ?? 128;

        let hardwareVoicesCount = 0;
        for (const inst of this.#activeGlobalVoices) {
            if (inst.state !== 'virtual') hardwareVoicesCount++;
        }

        if (hardwareVoicesCount >= this.#config.globalVoiceLimit) {
            const victim = this.#findStealCandidate(requestedPriority);

            if (!victim) {
                console.warn(`[Voice Limit] Dropped "${soundId}": priority ${requestedPriority} is too low.`);
                return null;
            }

            const victimConfig = this.#config.voiceConfigResolver(victim.id);
            if (victimConfig?.virtualization === 'virtualize' && 'virtualize' in victim) {
                victim.virtualize();
            } else {
                victim.stop();
            }
        }

        const available = this.#getPool(this.#available, soundId);
        const busy = this.#getPool(this.#busy, soundId);

        let instance: ISoundInstance;

        if (available.length > 0) {
            instance = available.pop()!;
            instance.resetForReuse();
        } else if (busy.length >= this.#config.maxPolyphony) {
            if (this.#config.policy === 'steal_oldest') {
                instance = busy.shift()!;
                instance.resetForReuse();
            } else {
                instance = this.#instanceFactory(soundId);
            }
        } else {
            instance = this.#instanceFactory(soundId);
        }

        if (!busy.includes(instance)) {
            busy.push(instance);
        }
        this.#activeGlobalVoices.add(instance);

        const off = instance.on('ended', () => {
            off();
            this.release(instance);
        });

        return instance;
    }

    public release(instance: ISoundInstance): void {
        const soundId = instance.id;
        const busy = this.#getPool(this.#busy, soundId);
        const available = this.#getPool(this.#available, soundId);

        this.#activeGlobalVoices.delete(instance);

        const index = busy.indexOf(instance);
        if (index !== -1) {
            busy.splice(index, 1);
        }

        if (!available.includes(instance)) {
            available.push(instance);
        }
    }

    public dispose(soundId?: SoundId): void {
        const ids = soundId ? [soundId] : [...new Set([...this.#available.keys(), ...this.#busy.keys()])];

        for (const id of ids) {
            const available = this.#available.get(id) ?? [];
            const busy = this.#busy.get(id) ?? [];

            for (const instance of [...available, ...busy]) {
                instance.dispose();
                this.#activeGlobalVoices.delete(instance);
            }

            this.#available.delete(id);
            this.#busy.delete(id);
        }
    }

    #getPool(map: Map<SoundId, ISoundInstance[]>, soundId: SoundId): ISoundInstance[] {
        if (!map.has(soundId)) {
            map.set(soundId, []);
        }
        return map.get(soundId)!;
    }

    #findStealCandidate(requestedPriority: number): ISoundInstance | null {
        let weakestInstance: ISoundInstance | null = null;
        let weakestPriority = -1;

        for (const instance of this.#activeGlobalVoices) {
            if (instance.state === 'virtual') continue;

            const config = this.#config.voiceConfigResolver(instance.id);
            const priority = config?.priority ?? 128;

            if (priority > weakestPriority) {
                weakestPriority = priority;
                weakestInstance = instance;
            }
        }

        if (weakestPriority >= requestedPriority) {
            return weakestInstance;
        }

        return null;
    }
}

export default SoundPoolManager;
