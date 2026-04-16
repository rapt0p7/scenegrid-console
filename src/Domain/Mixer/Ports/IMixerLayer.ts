import type { MixerSnapshot } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';

export interface IMixerLayer {
    id: string;
    priority: number;
    snapshot: MixerSnapshot;
}
