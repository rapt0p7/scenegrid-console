import type { FilterConfig } from '@webaudio-core/nodes/AudioNodeFactory.js';
import type { AudioNodeLike, GainNodeLike } from '@webaudio-core/types/IAudioContext.js';

export interface INodeChain {
    readonly inputNode: GainNodeLike;
    readonly outputNode: AudioNodeLike;
    readonly instanceGain: GainNodeLike;
    connectTo(destination: AudioNodeLike): void;
    setFilters(configs: FilterConfig[]): void;
    disconnect(): void;
    dispose(): void;
}
