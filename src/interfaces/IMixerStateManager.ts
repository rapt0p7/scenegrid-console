import type { IFilter } from './IFilter.js';
import type { IRTPCConfig, RTPCTargetProperty } from './IRTPCManager.js';

export interface MixerState {
    buses: Record<
        string,
        {
            gain: number;
            filter?: IFilter | null;
            sends?: Record<string, number | null>;
            rtpc?: Partial<Record<RTPCTargetProperty, IRTPCConfig>>;
        }
    >;
    metadata?: {
        snapshotId?: string;
        timestamp: number;
    };
}

export type MixerSnapshot = Partial<MixerState>;

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
