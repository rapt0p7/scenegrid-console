import type { IAudioBus } from '@domain/BusSystem/Ports/IAudioBus';
import type { BusId } from '@domain/Types/Branded.js';

export interface IAudioBusSystem {
    clearAllSidechainTriggers(): void;
    getBus(id: BusId): IAudioBus | undefined;
    getAllBuses(): ReadonlyMap<BusId, IAudioBus>;
    applySend(sourceBusId: BusId, targetBusId: BusId, gain: number | null, durationMs?: number): void;
    getCurrentRealGain(busId: BusId): number;
    getDefaultGain(busId: BusId): number;
}
