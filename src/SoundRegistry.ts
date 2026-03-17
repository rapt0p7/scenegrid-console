interface SoundDescriptor {
    buffer: AudioBuffer;
    options: {
        url: string;
        hasPanner?: boolean;
    };
}

export default class SoundRegistry {
    #map = new Map<string, SoundDescriptor>();

    register(id: string, desc: SoundDescriptor): void {
        this.#map.set(id, desc);
    }

    get registry(): Map<string, SoundDescriptor> {
        return this.#map;
    }

    get(id: string): SoundDescriptor {
        const entry = this.#map.get(id);
        if (!entry) {
            throw new Error(`Sound "${id}" not registered`);
        }
        return entry;
    }
}
