import type { SoundId } from '@shared/Types/Branded.js';
import { DeepReadonly } from '@shared/DeepReadonly.js';

interface SoundDescriptor {
    readonly buffer: AudioBuffer;
    readonly options: {
        readonly url: string;
    };
}

export default class SoundRegistry {
    #map = new Map<SoundId, SoundDescriptor>();

    register(id: SoundId, desc: DeepReadonly<SoundDescriptor>): void {
        this.#map.set(id, desc);
    }

    get registry(): Map<SoundId, SoundDescriptor> {
        return this.#map;
    }

    get(id: SoundId): SoundDescriptor {
        const entry = this.#map.get(id);
        if (!entry) {
            throw new Error(`Sound "${id}" not registered`);
        }
        return entry;
    }
}
