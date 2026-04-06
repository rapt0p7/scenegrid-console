import type AutomationEngine from '@webaudio-core/automation/AutomationEngine.js';
import type { AudioCtx, BiquadFilterNodeLike, ConvolverNodeNodeLike } from '@webaudio-core/types/IAudioContext.js';
import type { IFilterConfig, IReverbFilterConfig } from '@webaudio-core/types/IFilter.js';

export interface IFiltersPlugin {
    createNode(
        context: AudioCtx,
        automation: AutomationEngine,
        config: IFilterConfig | IReverbFilterConfig
    ): BiquadFilterNodeLike | ConvolverNodeNodeLike | null;
}
