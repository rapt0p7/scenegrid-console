import type { MixerSnapshot } from './IMixerStateManager.js';

export interface IMixerLayer {
    id: string;
    priority: number;
    snapshot: MixerSnapshot;
}
