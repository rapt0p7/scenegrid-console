import type { SoundId } from '@shared/Types/Branded.js';
import type { ISwitchPlaybackState } from '@domain/Managers/Ports/ISwitchPlaybackState.js';

export interface ISwitchHistoryRegistry {
    getHistory(switchId: SoundId): ISwitchPlaybackState | undefined;
    updateHistory(switchId: SoundId, state: ISwitchPlaybackState): void;
    clear(): void;
}
