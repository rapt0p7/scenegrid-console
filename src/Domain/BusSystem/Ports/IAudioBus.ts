import type { IBus } from '@domain/BusSystem/Ports/IBuses.js';
import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter';

export interface IAudioBus {
    logicalTargetGain: number;
    getConfig(): IBus;
    bindRTPC(configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | undefined, rtpcAdapter: IRTPCAdapter): void;
    safeReplaceFilter(newFilterConfig: IFilter | null, durationMs?: number): void;
    updateFilterParams(config: IFilter | null): void;
    setLogicalGain(gain: number, durationMs: number): void;
    setGainImmediate(gain: number): void;
    setRtpcGainModifier(modifier: number, durationMs: number): void;
}
