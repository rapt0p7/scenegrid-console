// noinspection D

import mitt from 'mitt';

import type MixerCoordinator from './MixerCoordinator';
import type MixerLayerStack from './MixerLayer';
import type { MixerSnapshot, MixerEvents } from '../interfaces/IMixerStateManager';
import type { Emitter } from 'mitt';

export default class MixerSnapshotManager {
    public readonly events: Emitter<MixerEvents> = mitt<MixerEvents>();

    constructor(
        private readonly layerStack: MixerLayerStack,
        private readonly snapshots: Record<string, MixerSnapshot>,
        private readonly coordinator: MixerCoordinator
    ) {}

    async activateSnapshot(name: string, layerId: string, priority: number): Promise<void> {
        const snapshot = this.snapshots[name];
        if (!snapshot) return;

        const durationMs = 500;

        this.events.emit('snapshot:enter', { layerId, snapshotName: name, priority });
        this.events.emit('transition:start', { layerId, snapshotName: name, durationMs });

        this.layerStack.addLayer({
            id: layerId,
            priority,
            snapshot: {
                ...snapshot,
                metadata: {
                    snapshotId: name,
                    timestamp: performance.now()
                }
            }
        });

        await this.coordinator.recompute({ durationMs });

        this.events.emit('transition:end', { layerId, snapshotName: name });
    }

    async clearLayer(layerId: string): Promise<void> {
        if (!this.layerStack.hasLayer(layerId)) return;

        const durationMs = 500;

        this.events.emit('snapshot:exit', { layerId });
        this.events.emit('transition:start', { layerId, snapshotName: 'clear', durationMs });

        this.layerStack.removeLayer(layerId);

        await this.coordinator.recompute({ durationMs });

        this.events.emit('transition:end', { layerId, snapshotName: 'clear' });
    }
}
