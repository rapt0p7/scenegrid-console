import type { MixerSnapshot } from '@domain/Mixer/Ports/IMixerStateManager.js';

export interface IMixerLayer {
    id: string;
    priority: number;
    snapshot: MixerSnapshot;
}
