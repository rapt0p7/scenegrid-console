import type { SoundId } from '@shared/Types/Branded.js';

interface SoundDescriptor {
    readonly options: {
        readonly url: string | string[];
    };
}

export default class SoundRegistry {
    readonly #map = new Map<SoundId, SoundDescriptor>();

    public register(id: SoundId, desc: SoundDescriptor): void {
        this.#map.set(id, desc);
    }

    public get registry(): Map<SoundId, SoundDescriptor> {
        return this.#map;
    }

    public get(id: SoundId): SoundDescriptor {
        const entry = this.#map.get(id);
        if (!entry) {
            throw new Error(`Sound "${id}" not registered`);
        }
        return entry;
    }
}
