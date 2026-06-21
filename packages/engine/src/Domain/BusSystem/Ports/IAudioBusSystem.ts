import type { IAudioBus } from '@domain/BusSystem/Ports/IAudioBus.js';
import type { BusId } from '@scene-grid/shared';
import { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { IBus, IBuses } from '@domain/BusSystem/Ports/IBuses.js';

export interface IAudioBusSystem {
    clearAllSidechainTriggers(): void;
    getBus(id: BusId): IAudioBus | undefined;
    getAllBuses(): ReadonlyMap<BusId, IAudioBus>;
    applySend(sourceBusId: BusId, targetBusId: BusId, gain: number | null, durationMs?: number): void;
    getCurrentRealGain(busId: BusId): number;
    getDefaultGain(busId: BusId): number;
    getBusLogicalGain(busId: BusId): number | undefined;
    getBusRtpcGain(busId: BusId): number | undefined;
    getBusFinalGain(busId: BusId): number | undefined;
    getBaseBusConfig(busId: BusId): IBus | undefined;
    getSidechainGain(busId: BusId): number;
    tickRTPC(rtpcAdapter: IRTPCAdapter): void;
    updateConfig(newConfig: IBuses): Promise<void>;
}
