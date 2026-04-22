import {
    AudioNodeLike,
    AudioParamLike,
    BiquadFilterNodeLike,
    PannerNodeLike,
    StereoPannerNodeLike
} from '@infrastructure/types/IAudioContext.js';
import type { IFilterConfig } from '@infrastructure/types/IFilter.js';

export interface INodeChain {
    readonly gainParam: AudioParamLike;
    readonly pannerNode: StereoPannerNodeLike | PannerNodeLike | null;
    readonly mainFilterNode: BiquadFilterNodeLike | null;
    readonly sidechainTriggerNode: AudioNodeLike;
    connectTo(destination: AudioNodeLike): void;
    connectSource(source: AudioNodeLike): void;
    setFilters(configs: IFilterConfig[]): void;
    disconnect(): void;
    dispose(): void;
}
