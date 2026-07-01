// noinspection D

import mitt from 'mitt';
import type { Emitter } from 'mitt';
import { CyclePool, isDefined, type ITelemetryCauseChain } from '@scene-grid/shared';
import type { LayerId, SnapshotId, TelemetryPacket } from '@scene-grid/shared';
import type MixerCoordinator from '@domain/Mixer/MixerCoordinator.js';
import type MixerLayerStack from '@domain/Mixer/MixerLayer.js';
import type { MixerEvents } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import type { ISnapshots } from '@domain/Mixer/Ports/ISnapshots.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';

export default class MixerSnapshotManager {
    public readonly events: Emitter<MixerEvents> = mitt<MixerEvents>();

    private readonly telemetryPool = new CyclePool<TelemetryPacket>(256, () => ({
        type: 'CAUSE_CHAIN',
        timestampMs: 0,
        initiator: { type: 'API', method: '' },
        result: {
            type: 'SET_MIX_SNAPSHOT',
            snapshotId: '',
            fadeTimeMs: 0
        },
        conditionTrace: undefined
    }));

    constructor(
        private readonly layerStack: MixerLayerStack,
        private readonly snapshots: ISnapshots,
        private readonly coordinator: MixerCoordinator,
        private readonly telemetry: ITelemetryDispatcher,
        private readonly soundController: ISoundController
    ) {}

    activateSnapshot(name: SnapshotId, layerId: LayerId, priority: number, durationMs: number = 500): void {
        const snapshot = this.snapshots[name];
        if (!isDefined(snapshot)) return;

        this.events.emit('snapshot:enter', { layerId, snapshotName: name, priority });
        this.events.emit('transition:start', { layerId, snapshotName: name, durationMs });

        this.dispatchTelemetrySnapshotChange(name, durationMs, 'activateSnapshot');

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

    clearLayer(layerId: LayerId, durationMs: number = 500): void {
        if (!this.layerStack.hasLayer(layerId)) return;

        this.events.emit('snapshot:exit', { layerId });
        this.events.emit('transition:start', { layerId, snapshotName: 'clear', durationMs });

        this.layerStack.removeLayer(layerId);

        this.coordinator.recompute({ durationMs });

        this.dispatchTelemetrySnapshotChange('CLEAR', durationMs, 'clearLayer');

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

    private dispatchTelemetrySnapshotChange(snapshotId: string, fadeTimeMs: number, methodName: string): void {
        if (!this.telemetry) return;

        const log = this.telemetryPool.getNext() as unknown as ITelemetryCauseChain;

        const mutableLog = log as any;

        mutableLog.timestampMs = this.soundController.getCurrentTime() * 1000;

        mutableLog.initiator.type = 'API';
        mutableLog.initiator.method = methodName;

        mutableLog.result.type = 'SET_MIX_SNAPSHOT';
        mutableLog.result.snapshotId = snapshotId;
        mutableLog.result.fadeTimeMs = fadeTimeMs;
        mutableLog.conditionTrace = undefined;

        this.telemetry.dispatch(log);
    }
}
