import type { IFilter } from './IFilter';
import type { IRTPCConfig, RTPCTargetProperty } from './IRTPCManager';

export interface IBus {
    gain?: number;
    filter?: IFilter;
    sends?: Record<string, number>;
    rtpc?: Partial<Record<RTPCTargetProperty, IRTPCConfig>>;
}

export interface IBuses {
    [key: string]: IBus;
}
