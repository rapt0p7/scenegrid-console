import type {
    SoundId,
    GameParamId,
    EventId,
    SnapshotId,
    RegionId,
    IDebugTransitionOptions,
    Milliseconds
} from '@scene-grid/shared';

export interface IInspectorDebugPort {
    fireEvent(eventId: EventId): void;
    applySnapshot(snapshotId: SnapshotId, fadeTime?: Milliseconds): void;
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
