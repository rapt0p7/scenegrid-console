import type { IFilter } from './IFilter.js';
import type { AudioCtx, AutomationEngine, BiquadFilterNodeLike, ConvolverNodeNodeLike } from '@webaudio-core';

export interface IFiltersPlugin {
    createNode(
        context: AudioCtx,
        automation: AutomationEngine,
        config: IFilter
    ): BiquadFilterNodeLike | ConvolverNodeNodeLike | null;
}
