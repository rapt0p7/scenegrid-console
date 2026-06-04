import type { SoundId } from '@scene-grid/shared';
import type { ISwitchPlaybackState } from '@domain/Managers/Ports/ISwitchPlaybackState.js';

export interface ISwitchHistoryRegistry {
    getHistory(switchId: SoundId): ISwitchPlaybackState | undefined;
    updateHistory(switchId: SoundId, state: ISwitchPlaybackState): void;
    clear(): void;
}
