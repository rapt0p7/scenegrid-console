import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import { BusId } from '@shared/Types/Branded.js';

export interface IBus {
    readonly gain?: number;
    readonly filter?: IFilter;
    readonly sends?: Record<BusId, number>;
    readonly rtpc?: Partial<Record<RTPCTargetProperty, IRTPCConfig>>;
    readonly sidechain?: {
        readonly enabled: boolean;
    };
}

export interface IBuses {
    readonly [key: string]: IBus;
}
