import type { ISwitchHistoryRegistry } from '@domain/Managers/Ports/ISwitchHistoryRegistry.js';
import type { ISwitchPlaybackState } from '@domain/Managers/Ports/ISwitchPlaybackState.js';
import type { SoundId } from '@shared/Types/Branded.js';

export class SwitchHistoryRegistry implements ISwitchHistoryRegistry {
    private readonly history = new Map<SoundId, ISwitchPlaybackState>();

    public getHistory(switchId: SoundId): ISwitchPlaybackState | undefined {
        return this.history.get(switchId);
    }

    public updateHistory(switchId: SoundId, state: ISwitchPlaybackState): void {
        this.history.set(switchId, state);
    }

    public clear(): void {
        this.history.clear();
    }
}
