import type { IAudioBus } from './IAudioBus.js';
import type { IBuses } from './IBuses.js';
import type { GainNodeLike, ISoundInstance, ISidechain } from '@infrastructure';

export type BusId = Extract<keyof IBuses, string>;

export interface IAudioBusSystem {
    getAllBuses(): ReadonlyMap<BusId, IAudioBus>;
    getBus(id: BusId): IAudioBus | undefined;
    getMasterNode(): GainNodeLike;
    getSidechain(busId: string): ISidechain | undefined;
    getCurrentRealGain(busId: BusId): number;
    computeOfflineGainTransition(busId: BusId, nextGain: number): { from: number; to: number };
    routeInstance(instance: ISoundInstance, busId: BusId): void;
    applySend(sourceBusId: BusId, targetBusId: BusId, gain: number | null, durationMs?: number): void;
}
