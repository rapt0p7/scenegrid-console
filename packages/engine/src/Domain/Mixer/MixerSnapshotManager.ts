// noinspection D

import mitt from 'mitt';

import type MixerCoordinator from '@domain/Mixer/MixerCoordinator.js';
import type MixerLayerStack from '@domain/Mixer/MixerLayer.js';
import type { MixerEvents } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import type { ISnapshots } from '@domain/Mixer/Ports/ISnapshots.js';
import type { Emitter } from 'mitt';
import { isDefined } from '@scene-grid/shared';
import type { LayerId, SnapshotId } from '@scene-grid/shared';

export default class MixerSnapshotManager {
    public readonly events: Emitter<MixerEvents> = mitt<MixerEvents>();

    constructor(
        private readonly layerStack: MixerLayerStack,
        private readonly snapshots: ISnapshots,
        private readonly coordinator: MixerCoordinator
    ) {}

    activateSnapshot(name: SnapshotId, layerId: LayerId, priority: number): void {
        const snapshot = this.snapshots[name];
        if (!isDefined(snapshot)) return;

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

        this.events.emit('transition:end', { layerId, snapshotName: name });
    }

    clearLayer(layerId: LayerId): void {
        if (!this.layerStack.hasLayer(layerId)) return;

        const durationMs = 500;

        this.events.emit('snapshot:exit', { layerId });
        this.events.emit('transition:start', { layerId, snapshotName: 'clear', durationMs });

        this.layerStack.removeLayer(layerId);

        this.coordinator.recompute({ durationMs });

        this.events.emit('transition:end', { layerId, snapshotName: 'clear' });
    }

    public get debugLayerStack(): MixerLayerStack {
        return this.layerStack;
    }

    /**
     * @internal Hot Module Replacement API
     * Soft-reloads the snapshots configuration without stopping the audio context.
     */
    public updateSnapshotsConfig(newSnapshots: ISnapshots): void {
        (this as any).snapshots = newSnapshots;

        for (const layer of this.layerStack.getLayers()) {
            const snapshotId = layer.snapshot.metadata?.snapshotId;

            if (isDefined(snapshotId) && isDefined(this.snapshots[snapshotId])) {
                const freshSnapshot = this.snapshots[snapshotId];

                this.layerStack.updateLayer(layer.id, {
                    ...freshSnapshot,
                    metadata: layer.snapshot.metadata
                });
            }
        }
    }
}
