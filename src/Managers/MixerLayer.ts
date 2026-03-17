import type MixerStateResolver from './MixerStateResolver';
import type { IMixerLayer } from '../interfaces/IMixerLayer';
import type { MixerSnapshot, MixerState } from '../interfaces/IMixerStateManager';

export const PRIORITY = {
    BASE: 0,
    OVERLAY: 100,
    MODAL: 200,
    TRANSIENT: 300
};

export default class MixerLayerStack {
    private readonly resolver: MixerStateResolver;
    private readonly layers: Map<string, IMixerLayer> = new Map();
    private readonly onChange: () => void;

    constructor(resolver: MixerStateResolver, onChange: () => void) {
        this.resolver = resolver;
        this.onChange = onChange;
    }

    addLayer(layer: IMixerLayer): void {
        this.layers.set(layer.id, layer);
        this.onChange();
    }

    removeLayer(id: string): void {
        this.layers.delete(id);
        this.onChange();
    }

    updateLayer(id: string, patch: MixerSnapshot): void {
        const layer = this.layers.get(id);
        if (!layer) return;
        layer.snapshot = patch;
        this.onChange();
    }

    clearByPrefix(prefix: string): void {
        for (const id of this.layers.keys()) {
            if (id.startsWith(prefix)) {
                this.layers.delete(id);
            }
        }
    }

    computeState(base: MixerState): MixerState {
        const ordered = [...this.layers.values()].sort((a, b) => a.priority - b.priority);

        let state = base;

        for (const layer of ordered) {
            state = this.resolver.resolve(state, layer.snapshot);
        }

        return state;
    }

    hasLayer(id: string): boolean {
        return this.layers.has(id);
    }
}
