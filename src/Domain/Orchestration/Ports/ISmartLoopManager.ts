import type { IAudioGrid } from '@domain/Orchestration/Ports/IAudioGrid.js';
import type { SoundId } from '@domain/Types/Branded';

export enum LoopState {
    IDLE = 'IDLE',
    LOOPING = 'LOOPING',
    TRANSITIONING = 'TRANSITIONING'
}

export type QuantizeType = 'Immediate' | 'NextBeat' | 'NextBar';
export type TransitionBlendMode = 'overlap' | 'crossfade';

export interface ITransitionToParameters {
    soundId: SoundId;
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
    playLoop(soundId: SoundId, regionName: string): void;
    stopLoop(soundId: SoundId): void;
    transitionTo(parameters: ITransitionToParameters): void;
    destroy(): void;
}
