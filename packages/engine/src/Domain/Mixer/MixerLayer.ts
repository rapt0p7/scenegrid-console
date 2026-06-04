// noinspection D

import { isAbsent } from '@scene-grid/shared';
import type { DeepReadonly, LayerId } from '@scene-grid/shared';
import type MixerStateResolver from '@domain/Mixer/MixerStateResolver.js';
import type { IMixerLayer } from '@domain/Mixer/Ports/IMixerLayer.js';
import type { MixerSnapshot, MixerState } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';

export const PRIORITY = {
    BASE: 0,
    OVERLAY: 100,
    MODAL: 200,
    TRANSIENT: 300
} as const;

export default class MixerLayerStack {
    private readonly resolver: MixerStateResolver;
    private readonly layers: Map<LayerId, DeepReadonly<IMixerLayer>> = new Map();
    private readonly onChange: () => void;

    constructor(resolver: MixerStateResolver, onChange: () => void) {
        this.resolver = resolver;
        this.onChange = onChange;
    }

    addLayer(layer: DeepReadonly<IMixerLayer>): void {
        this.layers.set(layer.id, layer);
        this.onChange();
    }

    removeLayer(id: LayerId): void {
        this.layers.delete(id);
        this.onChange();
    }

    updateLayer(id: LayerId, patch: DeepReadonly<MixerSnapshot>): void {
        const layer = this.layers.get(id);
        if (isAbsent(layer)) return;

        this.layers.set(id, { ...layer, snapshot: patch });
        this.onChange();
    }

    clearByPrefix(prefix: string): void {
        for (const id of this.layers.keys()) {
            if (id.startsWith(prefix)) {
                this.layers.delete(id);
            }
        }
    }

    computeState(base: DeepReadonly<MixerState>): MixerState {
        // oxlint-disable-next-line unicorn/no-array-sort
        const ordered = [...this.layers.values()].sort((a, b) => a.priority - b.priority);

        let state: DeepReadonly<MixerState> | MixerState = base;

        for (const layer of ordered) {
            state = this.resolver.resolve(state, layer.snapshot);
        }

        return state as MixerState;
    }

    public getLayers(): DeepReadonly<IMixerLayer>[] {
        return Array.from(this.layers.values());
    }

    hasLayer(id: LayerId): boolean {
        return this.layers.has(id);
    }
}
