import type { MixerSnapshot } from './IMixerStateManager';

export interface IMixerLayer {
    id: string;
    priority: number;
    snapshot: MixerSnapshot;
}
