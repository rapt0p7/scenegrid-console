import type { SoundId } from '@scene-grid/shared';
import type { ISwitchPlaybackState } from '@domain/Managers/Ports/ISwitchPlaybackState.js';

export interface ISwitchHistoryRegistry {
    getHistory(switchId: SoundId): ISwitchPlaybackState | undefined;
    updateHistory(switchId: SoundId, state: ISwitchPlaybackState): void;
    setOverride(switchId: SoundId, value: string | number, isOverride: boolean): void;
    getOverride(switchId: SoundId): string | number | undefined;
    resetOverrides(): void;
    clear(): void;
}
