import type { BusId, PlaybackId } from '@domain/Types/Branded.js';

export interface IDuckingManager {
    clearAll(): void;
    triggerDucking(playbackId: PlaybackId, targetBusIdOrArray: BusId | BusId[], intensity: number | number[]): void;
}
