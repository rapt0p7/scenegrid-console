import type { IAudioBus } from './IAudioBus';
import type { ISidechain } from './IAudioPlugins';
import type { IBuses } from './IBuses';
import type { IDuckingConfig } from './ISoundConfig';
import type { GainNodeLike, ISoundInstance } from '@webaudio-core';

export type BusId = Extract<keyof IBuses, string>;

export interface IAudioBusSystem {
    getAllBuses(): ReadonlyMap<BusId, IAudioBus>;
    getBus(id: BusId): IAudioBus | undefined;
    getMasterNode(): GainNodeLike;
    getSidechain(busId: string): ISidechain | undefined;
    createSidechain(busId: BusId, options?: IDuckingConfig): ISidechain | null;
    getCurrentRealGain(busId: BusId): number;
    computeOfflineGainTransition(busId: BusId, nextGain: number): { from: number; to: number };
    routeInstance(instance: ISoundInstance, busId: BusId): void;
    applySend(sourceBusId: BusId, targetBusId: BusId, gain: number | null, durationMs?: number): void;
}
