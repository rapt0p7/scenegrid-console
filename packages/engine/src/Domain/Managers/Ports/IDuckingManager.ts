import type { BusId, PlaybackId, DeepReadonly } from '@scene-grid/shared';

export interface IDuckingManager {
    clearAll(): void;
    triggerDucking(
        playbackId: PlaybackId,
        targetBusIdOrArray: DeepReadonly<BusId | BusId[]>,
        intensity: number | number[]
    ): void;
}
