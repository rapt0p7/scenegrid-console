import type {
    IConditionConfig,
    MusicStateId,
    QuantizeType,
    RegionId,
    SnapshotId,
    SoundId,
    Milliseconds
} from '@scene-grid/shared';

export interface IMusicFSMConfig {
    readonly initialState: MusicStateId;
    readonly globalEdges: ReadonlyArray<IMusicTransitionEdge>;
    readonly states: Record<MusicStateId, IMusicStateNode>;
}

export interface IMusicStateNode {
    readonly id: MusicStateId;
    readonly soundId: SoundId;
    readonly sequencerRegion: RegionId;
    readonly activeSnapshot?: SnapshotId;
    readonly edges: ReadonlyArray<IMusicTransitionEdge>;
}

export interface IMusicTransitionEdge {
    readonly targetState: MusicStateId;
    readonly conditions: ReadonlyArray<IConditionConfig>;
    readonly syncRule: QuantizeType;
    readonly crossfadeDuration?: Milliseconds;
    readonly transitionRegionName?: RegionId;
    readonly stingerId?: SoundId;
    readonly interruptable: boolean;
}
