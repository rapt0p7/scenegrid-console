import type { IBus } from './IBuses.js';
import type { IFilter } from './IFilter.js';
import type { IRTPCManager, IRTPCConfig, RTPCTargetProperty } from './IRTPCManager.js';
import type { AudioNodeLike, BiquadFilterNodeLike } from '@infrastructure';

export interface IAudioBus {
    logicalTargetGain: number;
    getConfig(): IBus;
    updateSend(sendParameters: {
        targetBusId: string;
        targetNode: AudioNodeLike;
        targetGain: number | null;
        durationMs?: number;
    }): void;
    bindRTPC(configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | undefined, rtpcManager: IRTPCManager): void;
    safeReplaceFilter(newFilterConfigOrNode: BiquadFilterNodeLike | IFilter | null, durationMs?: number): Promise<void>;
    updateFilterParams(config: IFilter | null): void;
    setLogicalGain(gain: number, durationMs: number): void;
    setRtpcGainModifier(modifier: number, durationMs: number): void;
}
