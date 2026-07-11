import type { SoundId, GameParamId, EventId, SnapshotId } from '@scene-grid/shared';

export interface IInspectorDebugPort {
    fireEvent(eventId: EventId): void;
    applySnapshot(snapshotId: SnapshotId, fadeTimeMs?: number): void;
    setRtpcOverride(param: GameParamId, value: number, isOverride: boolean): void;
    setSwitchOverride(switchId: SoundId, currentKey: string, isOverride: boolean): void;
    stopAll(): void;
    pauseAll(): void;
    resumeAll(): void;
    clearAllOverrides(): void;
}
