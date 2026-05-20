import type { IAudioGrid } from '@domain/Orchestration/Ports/IAudioGrid.js';
import { RegionId, SoundId } from '@shared/Types/Branded.js';
import { QuantizeType } from '@domain/Shared/Types/Musical.js';

export enum LoopState {
    IDLE = 'IDLE',
    LOOPING = 'LOOPING',
    TRANSITIONING = 'TRANSITIONING'
}

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
    readonly offsetMode?: 'None' | 'Relative' | 'Inverted';
}

export interface ISequencer {
    playLoop(soundId: SoundId, regionName: RegionId): void;
    playStinger(stingerId: SoundId, quantize?: QuantizeType, referenceTrackId?: SoundId): void;
    stopLoop(soundId: SoundId): void;
    transitionTo(parameters: ITransitionToParameters): void;
    destroy(): void;
}
