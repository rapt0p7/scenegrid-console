import type { SoundId } from '@shared/Types/Branded.js';

export interface IContainerPlaybackState {
    readonly lastPlayedIndex: number;
}

export interface IContainerEvaluationResult {
    readonly soundId: SoundId | null;
    readonly nextState: IContainerPlaybackState;
}
