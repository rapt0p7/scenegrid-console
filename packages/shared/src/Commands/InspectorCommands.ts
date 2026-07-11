import type { EventId, GameParamId, SoundId, SnapshotId } from '../Types/Branded.js';

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
    readonly fadeTimeMs?: number;
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

export interface IClearAllOverridesCommand extends ICommandBase {
    readonly type: 'CLEAR_ALL_OVERRIDES';
}

export type InspectorCommand =
    | IFireEventCommand
    | ISetRtpcCommand
    | ISetSwitchCommand
    | IApplySnapshotCommand
    | IGlobalActionCommand
    | IClearAllOverridesCommand;
