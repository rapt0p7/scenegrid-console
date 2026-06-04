import type { IContainerHistoryRegistry } from '@domain/Managers/Ports/IContainerHistoryRegistry.js';
import type { IContainerPlaybackState } from '@domain/Managers/Ports/IContainerPlaybackState.js';
import type { SoundId } from '@scene-grid/shared';

export class ContainerHistoryRegistry implements IContainerHistoryRegistry {
    private readonly history = new Map<SoundId, IContainerPlaybackState>();

    public getHistory(containerId: SoundId): IContainerPlaybackState {
        return this.history.get(containerId) ?? { lastPlayedIndex: -1 };
    }

    public updateHistory(containerId: SoundId, state: IContainerPlaybackState): void {
        this.history.set(containerId, state);
    }

    public clear(): void {
        this.history.clear();
    }
}
