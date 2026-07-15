import type { MusicStateId, SnapshotId } from '@scene-grid/shared';

export interface IConductorState {
    currentStateId: MusicStateId;
    readonly pendingMixer: {
        isActive: boolean;
        executionTime: number;
        snapshotId: SnapshotId;
        crossfadeMs: number;
    };
    isTransitioning: boolean;
}
