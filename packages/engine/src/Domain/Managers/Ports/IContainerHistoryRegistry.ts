import type { IContainerPlaybackState } from '@domain/Managers/Ports/IContainerPlaybackState.js';
import type { SoundId } from '@scene-grid/shared';

export interface IContainerHistoryRegistry {
    getHistory(containerId: SoundId): IContainerPlaybackState;
    updateHistory(containerId: SoundId, state: IContainerPlaybackState): void;
    clear(): void;
}
