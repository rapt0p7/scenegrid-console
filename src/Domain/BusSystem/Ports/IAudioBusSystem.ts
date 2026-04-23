import type { IAudioBus } from '@domain/BusSystem/Ports/IAudioBus.js';
import type { BusId } from '@shared/Types/Branded.js';
import { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { IBus } from '@domain/BusSystem/Ports/IBuses';

export interface IAudioBusSystem {
    clearAllSidechainTriggers(): void;
    getBus(id: BusId): IAudioBus | undefined;
    getAllBuses(): ReadonlyMap<BusId, IAudioBus>;
    applySend(sourceBusId: BusId, targetBusId: BusId, gain: number | null, durationMs?: number): void;
    getCurrentRealGain(busId: BusId): number;
    getDefaultGain(busId: BusId): number;
    getBaseBusConfig(busId: BusId): IBus | undefined;
    tickRTPC(rtpcAdapter: IRTPCAdapter): void;
}
