import type { MixerSnapshot } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import { LayerId } from '@domain/Types/Branded.js';

export interface IMixerLayer {
    readonly id: LayerId;
    readonly priority: number;
    readonly snapshot: MixerSnapshot;
}
