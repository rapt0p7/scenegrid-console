import type { Milliseconds, MusicStateId, SnapshotId } from '@scene-grid/shared';

export interface IConductorState {
    currentStateId: MusicStateId;
    readonly pendingMixer: {
        isActive: boolean;
        executionTime: number;
        snapshotId: SnapshotId;
        crossfade: Milliseconds;
    };
    isTransitioning: boolean;
}
