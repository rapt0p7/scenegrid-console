import type { IBus } from './IBuses';
import type { IFilter } from './IFilter';
import type { IRTPCManager, IRTPCConfig, RTPCTargetProperty } from './IRTPCManager';
import type { AudioNodeLike, BiquadFilterNodeLike } from '@webaudio-core';

export interface IAudioBus {
    logicalTargetGain: number;
    update(id: string, config?: IBus): Promise<void>;
    getConfig(): IBus;
    updateSend(targetBusId: string, targetNode: AudioNodeLike, targetGain: number | null, durationMs?: number): void;
    bindRTPC(configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | undefined, rtpcManager: IRTPCManager): void;
    safeReplaceFilter(newFilterConfigOrNode: BiquadFilterNodeLike | IFilter | null, durationMs?: number): Promise<void>;
    updateFilterParams(config: IFilter | null): void;
}
