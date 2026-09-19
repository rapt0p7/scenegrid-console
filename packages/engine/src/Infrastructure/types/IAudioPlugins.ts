import type { AudioNodeLike, GainNodeLike } from '@infrastructure/types/IAudioContext';
import type { IFiltersPlugin } from '@infrastructure/types/IFiltersPlugin.js';

import { Result } from '@scene-grid/shared';

export interface ILimiterNode {
    inputNode: AudioNodeLike;
    outputNode: AudioNodeLike;
    load?(): Promise<Result<AudioNodeLike | void, Error>>;
    dispose(): void;
}

export interface ISidechain {
    activeEnvelope: number;
    insertLookahead(nextNode: AudioNodeLike): void;
    addSource(sourceNode: AudioNodeLike, intensity?: number): void;
    removeSource(sourceNode: AudioNodeLike): void;
    start(): Promise<Result<void, Error>> | Result<void, Error>;
    stop(): void;
    dispose(): void;
    removeAllSources(): void;
}

export interface IPluginFactory {
    createLimiter(): ILimiterNode;
    createSidechain(targetGainNode: GainNodeLike, options?: { intensity?: number }): ISidechain;
    getFiltersPlugin(): IFiltersPlugin;
}
