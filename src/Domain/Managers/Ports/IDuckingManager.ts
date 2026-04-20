import type { BusId, PlaybackId } from '@domain/Types/Branded.js';
import { DeepReadonly } from '@shared/DeepReadonly.js';

export interface IDuckingManager {
    clearAll(): void;
    triggerDucking(
        playbackId: PlaybackId,
        targetBusIdOrArray: DeepReadonly<BusId | BusId[]>,
        intensity: number | number[]
    ): void;
}
