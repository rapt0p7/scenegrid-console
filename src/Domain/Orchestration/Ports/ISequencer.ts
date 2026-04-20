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
    readonly soundId: SoundId;
    readonly targetRegion: string;
    readonly transitionRegionName?: string;
    readonly options?: TransitionOptions;
}

export interface TransitionOptions {
    readonly quantize?: QuantizeType;
    readonly quantizeInterval?: number;
    readonly crossfadeDuration?: number;
    readonly grid?: IAudioGrid;
    readonly blendMode?: TransitionBlendMode;
    readonly interruptable?: boolean;
}

export interface ISequencer {
    playLoop(soundId: SoundId, regionName: string): void;
    stopLoop(soundId: SoundId): void;
    transitionTo(parameters: ITransitionToParameters): void;
    destroy(): void;
}
