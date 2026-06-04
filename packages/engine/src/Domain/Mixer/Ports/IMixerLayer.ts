import type { MixerSnapshot } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import type { LayerId } from '@scene-grid/shared';

export interface IMixerLayer {
    readonly id: LayerId;
    readonly priority: number;
    readonly snapshot: MixerSnapshot;
}
