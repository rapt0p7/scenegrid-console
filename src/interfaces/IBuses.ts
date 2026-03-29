import type { IFilter } from './IFilter.js';
import type { IRTPCConfig, RTPCTargetProperty } from './IRTPCManager.js';

export interface IBus {
    gain?: number;
    filter?: IFilter;
    sends?: Record<string, number>;
    rtpc?: Partial<Record<RTPCTargetProperty, IRTPCConfig>>;
    sidechain?: {
        enabled: boolean;
    };
}

export interface IBuses {
    [key: string]: IBus;
}
