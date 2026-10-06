import type { IAudioGrid } from '@domain/Orchestration/Ports/IAudioGrid.js';
import type {
    RegionId,
    SoundId,
    PlaybackId,
    QuantizeType,
    IMusicTrackSnapshot,
    Milliseconds,
    Beats,
    Seconds
} from '@scene-grid/shared';

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
    readonly quantizeInterval?: Beats;
    readonly crossfadeDuration?: Milliseconds;
    readonly tailDuration?: Milliseconds;
    readonly grid?: IAudioGrid;
    readonly blendMode?: TransitionBlendMode;
    readonly interruptable?: boolean;
    readonly offsetMode?: 'None' | 'Relative' | 'Inverted';
}

export interface IPlaybackInfo {
    readonly grid: IAudioGrid;
    readonly soundId: SoundId;
    readonly state: LoopState;
}

export interface ActiveRegion {
    playbackId: PlaybackId;
    scheduledStartTime: Seconds;
    unsubscribe: () => void;
}

export interface QueuedRegion {
    name: RegionId;
    fadeInDuration: Milliseconds;
    startOffset?: Seconds;
}

export interface TrackContext {
    soundId: SoundId;
    state: LoopState;
    playId: number;
    nextScheduleTime: Seconds;
    activeRegions: Set<ActiveRegion>;
    gridStartTime: Seconds | null;
    regionQueue: QueuedRegion[];
    loopRegion: RegionId | null;
    currentRegion: RegionId | null;
    magnetStates: boolean[];
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
