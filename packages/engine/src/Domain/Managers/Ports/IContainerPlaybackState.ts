import type { SoundId } from '@scene-grid/shared';

export interface IContainerPlaybackState {
    readonly lastPlayedIndex: number;
    readonly recentHistory?: number[];
}

export interface IContainerEvaluationResult {
    readonly soundId: SoundId | null;
    readonly nextState: IContainerPlaybackState;
}
