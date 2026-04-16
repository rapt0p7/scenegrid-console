import type { SoundId } from '@domain/Types/Branded';

interface SoundDescriptor {
    buffer: AudioBuffer;
    options: {
        url: string;
    };
}

export default class SoundRegistry {
    #map = new Map<SoundId, SoundDescriptor>();

    register(id: string, desc: SoundDescriptor): void {
        this.#map.set(id as SoundId, desc);
    }

    get registry(): Map<SoundId, SoundDescriptor> {
        return this.#map;
    }

    get(id: string): SoundDescriptor {
        const entry = this.#map.get(id as SoundId);
        if (!entry) {
            throw new Error(`Sound "${id}" not registered`);
        }
        return entry;
    }
}
