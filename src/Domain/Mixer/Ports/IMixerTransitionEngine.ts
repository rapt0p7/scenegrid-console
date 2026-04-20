import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import { BusId, SnapshotId } from '@domain/Types/Branded.js';

export interface MixerState {
    readonly buses: Record<
        BusId,
        {
            readonly gain: number;
            readonly filter?: IFilter | null;
            readonly sends?: Sends;
            readonly rtpc?: Partial<Record<RTPCTargetProperty, IRTPCConfig>>;
        }
    >;
    readonly metadata?: {
        readonly snapshotId?: SnapshotId;
        readonly timestamp: number;
    };
}

export type Sends = Record<BusId, number | null>;

export type MixerSnapshot = Partial<MixerState>;

export interface ITransitionOptions {
    readonly durationMs?: number;
    readonly interruptible?: boolean;
}

export interface MixerEvents {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'transition:start': { layerId: string; snapshotName: string; durationMs: number };
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'transition:end': { layerId: string; snapshotName: string };
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'snapshot:enter': { layerId: string; snapshotName: string; priority: number };
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'snapshot:exit': { layerId: string };
    [key: string | symbol]: unknown;
}
