import type { AudioNodeLike, GainNodeLike } from '@webaudio-core/types/IAudioContext.js';
import type { IFilterConfig } from '@webaudio-core/types/IFilter.js';

export interface INodeChain {
    readonly inputNode: GainNodeLike;
    readonly outputNode: AudioNodeLike;
    readonly instanceGain: GainNodeLike;
    connectTo(destination: AudioNodeLike): void;
    setFilters(configs: IFilterConfig[]): void;
    disconnect(): void;
    dispose(): void;
}
