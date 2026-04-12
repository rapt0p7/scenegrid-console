import type { IAudioBus } from '@domain/BusSystem/Ports/IAudioBus';
import type { BusId, PlaybackId } from '@domain/Types/Branded.js';

export interface IAudioBusSystem {
    routePlayback(playbackId: PlaybackId, busId: BusId): void;
    addSidechainTrigger(busId: BusId, playbackId: PlaybackId, intensity: number): void;
    removeSidechainTrigger(busId: BusId, playbackId: PlaybackId): void;
    clearAllSidechainTriggers(): void;
    getBus(id: BusId): IAudioBus | undefined;
    getAllBuses(): ReadonlyMap<BusId, IAudioBus>;
    applySend(sourceBusId: BusId, targetBusId: BusId, gain: number | null, durationMs?: number): void;
    getCurrentRealGain(busId: BusId): number;
}
