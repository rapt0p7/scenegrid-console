import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';

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
