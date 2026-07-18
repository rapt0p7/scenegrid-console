import type { SoundId, GameParamId, EventId, SnapshotId, RegionId, IDebugTransitionOptions } from '@scene-grid/shared';

export interface IInspectorDebugPort {
    fireEvent(eventId: EventId): void;
    applySnapshot(snapshotId: SnapshotId, fadeTimeMs?: number): void;
    setRtpcOverride(param: GameParamId, value: number, isOverride: boolean): void;
    setSwitchOverride(switchId: SoundId, currentKey: string, isOverride: boolean): void;
    playLoop(soundId: SoundId, region: RegionId): void;
    stopLoop(soundId: SoundId): void;
    transitionMusicTo(
        soundId: SoundId,
        targetRegion: RegionId,
        transitionRegionName: RegionId,
        options: IDebugTransitionOptions
    ): void;
    stopAll(): void;
    pauseAll(): void;
    resumeAll(): void;
    clearAllOverrides(): void;
}
