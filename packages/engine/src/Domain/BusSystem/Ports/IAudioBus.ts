import type { IBus } from '@domain/BusSystem/Ports/IBuses.js';
import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import { Milliseconds } from '@scene-grid/shared';

export interface IAudioBus {
    logicalTargetGain: number;
    getConfig(): IBus;
    bindRTPC(configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | undefined, rtpcAdapter: IRTPCAdapter): void;
    safeReplaceFilter(newFilterConfig: IFilter | null, duration?: Milliseconds): void;
    updateFilterParams(config: IFilter | null): void;
    getTargetParamsGain(): { logical: number; rtpc: number };
    getLogicalTargetGain(): number;
    setLogicalGain(gain: number, duration: Milliseconds): void;
    setGainImmediate(gain: number): void;
    setRtpcGainModifier(modifier: number, duration: Milliseconds): void;
}
