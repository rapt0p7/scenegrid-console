import type { IFilter } from './IFilter';
import type { IRTPCConfig, RTPCTargetProperty } from './IRTPCManager';

export interface MixerState {
    buses: Record<
        string,
        {
            gain: number;
            filter?: IFilter | null;
            sidechain: {
                enabled: boolean;
            };
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
    'transition:start': { layerId: string; snapshotName: string; durationMs: number };
    'transition:end': { layerId: string; snapshotName: string };
    'snapshot:enter': { layerId: string; snapshotName: string; priority: number };
    'snapshot:exit': { layerId: string };
    [key: string | symbol]: unknown;
}
