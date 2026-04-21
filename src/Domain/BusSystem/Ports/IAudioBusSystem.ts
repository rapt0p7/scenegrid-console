import type { IAudioBus } from '@domain/BusSystem/Ports/IAudioBus.js';
import type { BusId } from '@shared/Types/Branded.js';
import { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';

export interface IAudioBusSystem {
    clearAllSidechainTriggers(): void;
    getBus(id: BusId): IAudioBus | undefined;
    getAllBuses(): ReadonlyMap<BusId, IAudioBus>;
    applySend(sourceBusId: BusId, targetBusId: BusId, gain: number | null, durationMs?: number): void;
    getCurrentRealGain(busId: BusId): number;
    getDefaultGain(busId: BusId): number;
    tickRTPC(rtpcAdapter: IRTPCAdapter): void;
}
