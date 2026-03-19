import type { IAudioGrid } from './IAudioGrid';

export enum LoopState {
    IDLE = 'IDLE',
    LOOPING = 'LOOPING',
    TRANSITIONING = 'TRANSITIONING'
}

export type QuantizeType = 'Immediate' | 'NextBeat' | 'NextBar';
export type TransitionBlendMode = 'overlap' | 'crossfade';

export interface ITransitionToParameters {
    soundId: string;
    targetRegion: string;
    transitionRegionName?: string;
    options?: TransitionOptions;
}

export interface TransitionOptions {
    quantize?: QuantizeType;
    quantizeInterval?: number;
    crossfadeDuration?: number;
    grid?: IAudioGrid;
    blendMode?: TransitionBlendMode;
    interruptable?: boolean;
}

export interface ISmartLoopManager {
    playLoop(soundId: string, regionName: string): void;
    stopLoop(soundId: string): void;
    transitionTo(parameters: ITransitionToParameters): void;
    destroy(): void;
}
