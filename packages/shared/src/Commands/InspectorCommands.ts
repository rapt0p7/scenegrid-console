import type { EventId, GameParamId, SoundId, SnapshotId, RegionId, Milliseconds, Beats } from '../Types/Branded.js';
import type { QuantizeType } from '../Types/Musical.js';

export interface ICommandBase {
    readonly timestampMs: number;
}

export interface IFireEventCommand extends ICommandBase {
    readonly type: 'FIRE_EVENT';
    readonly eventId: EventId;
}

export interface IApplySnapshotCommand extends ICommandBase {
    readonly type: 'APPLY_SNAPSHOT';
    readonly snapshotId: SnapshotId;
    readonly fadeTime?: Milliseconds;
}

export interface IGlobalActionCommand extends ICommandBase {
    readonly type: 'GLOBAL_ACTION';
    readonly action: 'STOP_ALL' | 'PAUSE_ALL' | 'RESUME_ALL';
}

export interface ISetRtpcCommand extends ICommandBase {
    readonly type: 'SET_RTPC';
    readonly param: GameParamId;
    readonly value: number;
    readonly isOverride: boolean;
}

export interface ISetSwitchCommand extends ICommandBase {
    readonly type: 'SET_SWITCH';
    readonly switchId: SoundId;
    readonly currentKey: string;
    readonly isOverride: boolean;
}

export interface IPlayLoopCommand extends ICommandBase {
    readonly type: 'PLAY_LOOP';
    readonly soundId: SoundId;
    readonly regionName: RegionId;
}

export interface IStopLoopCommand extends ICommandBase {
    readonly type: 'STOP_LOOP';
    readonly soundId: SoundId;
}

export interface IDebugTransitionOptions {
    readonly quantize: QuantizeType;
    readonly quantizeInterval: Beats;
    readonly crossfadeDuration: Milliseconds;
    readonly blendMode: 'overlap' | 'crossfade';
    readonly interruptable: boolean;
}

export interface ITransitionMusicCommand extends ICommandBase {
    readonly type: 'TRANSITION_MUSIC';
    readonly soundId: SoundId;
    readonly targetRegion: RegionId;
    readonly transitionRegionName: RegionId;
    readonly options: IDebugTransitionOptions;
}

export interface IClearAllOverridesCommand extends ICommandBase {
    readonly type: 'CLEAR_ALL_OVERRIDES';
}

export type InspectorCommand =
    | IFireEventCommand
    | ISetRtpcCommand
    | ISetSwitchCommand
    | IApplySnapshotCommand
    | IGlobalActionCommand
    | IClearAllOverridesCommand
    | IPlayLoopCommand
    | IStopLoopCommand
    | ITransitionMusicCommand;
