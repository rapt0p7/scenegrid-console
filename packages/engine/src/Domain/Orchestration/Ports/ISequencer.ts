import type { IAudioGrid } from '@domain/Orchestration/Ports/IAudioGrid.js';
import type { RegionId, SoundId, QuantizeType, IMusicTrackSnapshot } from '@scene-grid/shared';

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

export interface IPlaybackInfo {
    readonly grid: IAudioGrid;
}

export interface ISequencer {
    playLoop(soundId: SoundId, regionName: RegionId): void;
    playStinger(stingerId: SoundId, quantize?: QuantizeType, referenceTrackId?: SoundId): void;
    stopLoop(soundId: SoundId): void;
    transitionTo(parameters: ITransitionToParameters): void;
    getPlaybackInfo(soundId: SoundId): IPlaybackInfo | null;
    getMusicSnapshot(): readonly IMusicTrackSnapshot[];
    destroy(): void;
}
