import type { AudioNodeLike, GainNodeLike } from '@infrastructure/types/IAudioContext';
import type { IFiltersPlugin } from '@infrastructure/types/IFiltersPlugin.js';

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
    createSidechain(targetGainNode: GainNodeLike, options?: { intensity?: number }): ISidechain;
    getFiltersPlugin(): IFiltersPlugin;
}
