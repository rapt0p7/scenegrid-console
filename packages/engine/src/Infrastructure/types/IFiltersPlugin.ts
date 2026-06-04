import type AutomationEngine from '@infrastructure/automation/AutomationEngine.js';
import type { AudioCtx, BiquadFilterNodeLike, ConvolverNodeNodeLike } from '@infrastructure/types/IAudioContext.js';
import type { IFilterConfig, IReverbFilterConfig } from '@infrastructure/types/IFilter.js';

export interface IFiltersPlugin {
    createNode(
        context: AudioCtx,
        automation: AutomationEngine,
        config: IFilterConfig | IReverbFilterConfig
    ): BiquadFilterNodeLike | ConvolverNodeNodeLike | null;
}
