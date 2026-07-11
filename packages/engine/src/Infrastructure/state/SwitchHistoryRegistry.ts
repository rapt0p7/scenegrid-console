import type { ISwitchHistoryRegistry } from '@domain/Managers/Ports/ISwitchHistoryRegistry.js';
import type { ISwitchPlaybackState } from '@domain/Managers/Ports/ISwitchPlaybackState.js';
import type { SoundId } from '@scene-grid/shared';

export class SwitchHistoryRegistry implements ISwitchHistoryRegistry {
    private readonly history = new Map<SoundId, ISwitchPlaybackState>();
    private readonly overrides = new Map<SoundId, string | number>();

    public getHistory(switchId: SoundId): ISwitchPlaybackState | undefined {
        return this.history.get(switchId);
    }

    public updateHistory(switchId: SoundId, state: ISwitchPlaybackState): void {
        this.history.set(switchId, state);
    }

    public clear(): void {
        this.history.clear();
        this.overrides.clear();
    }

    public setOverride(switchId: SoundId, value: string | number, isOverride: boolean): void {
        if (isOverride) {
            this.overrides.set(switchId, value);
        } else {
            this.overrides.delete(switchId);
        }
    }

    public getOverride(switchId: SoundId): string | number | undefined {
        return this.overrides.get(switchId);
    }

    public resetOverrides(): void {
        this.overrides.clear();
    }
}
