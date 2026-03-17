import type { IFiltersPlugin } from './IFiltersPlugin';
import type { IDuckingConfig } from './ISoundConfig';
import type { AudioNodeLike, GainNodeLike } from '@webaudio-core';

export interface ILimiterNode {
    inputNode: AudioNodeLike;
    outputNode: AudioNodeLike;
    load?(): Promise<AudioNodeLike | void>;
    dispose(): void;
}

export interface ISidechain {
    activeEnvelope: number;
    insertLookahead(nextNode: AudioNodeLike): void;
    addSource(sourceNode: AudioNodeLike, intensity?: number): void;
    removeSource(sourceNode: AudioNodeLike): void;
    start(): Promise<void> | void;
    stop(): void;
    dispose(): void;
}

export interface IPluginFactory {
    createLimiter(): ILimiterNode;
    createSidechain(targetGainNode: GainNodeLike, options?: IDuckingConfig): ISidechain;
    getFiltersPlugin(): IFiltersPlugin;
}
