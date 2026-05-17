import type { IAudioGrid } from '@domain/Orchestration/Ports/IAudioGrid.js';
import { RegionId, SoundId } from '@shared/Types/Branded.js';

export enum LoopState {
    IDLE = 'IDLE',
    LOOPING = 'LOOPING',
    TRANSITIONING = 'TRANSITIONING'
}

export type QuantizeType = 'Immediate' | 'NextBeat' | 'NextBar';
export type TransitionBlendMode = 'overlap' | 'crossfade';

export interface ITransitionToParameters {
    readonly soundId: SoundId;
    readonly targetRegion: RegionId;
    readonly transitionRegionName?: RegionId;
    readonly options?: TransitionOptions;
}

export interface TransitionOptions {
    readonly quantize?: QuantizeType;
    readonly quantizeInterval?: number;
    readonly crossfadeDuration?: number;
    readonly tailDurationMs?: number;
    readonly grid?: IAudioGrid;
    readonly blendMode?: TransitionBlendMode;
    readonly interruptable?: boolean;
}

export interface ISequencer {
    playLoop(soundId: SoundId, regionName: RegionId): void;
    stopLoop(soundId: SoundId): void;
    transitionTo(parameters: ITransitionToParameters): void;
    destroy(): void;
}
