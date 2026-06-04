import type {
    BankId,
    EventId,
    GameParamId,
    LayerId,
    RegionId,
    SnapshotId,
    SoundId,
    QuantizeType
} from '@scene-grid/shared';
import type { ITransitionToParameters } from '@domain/Orchestration/Ports/ISequencer.js';
import type { IConditionConfig } from '@domain/Shared/Types/Condition.js';

export interface IStopOptions {
    readonly allowTail?: boolean;
    readonly fadeOutMs?: number;
}

export interface IBaseEventAction {
    readonly delayMs?: number;
    readonly probability?: number;
    readonly condition?: IConditionConfig;
}

export interface IPlayAction extends IBaseEventAction {
    readonly type: 'play';
    readonly target: SoundId;
}

export interface IStopAction extends IBaseEventAction {
    readonly type: 'stop';
    readonly target: SoundId;
    readonly options?: IStopOptions;
}

export interface IPauseAction extends IBaseEventAction {
    readonly type: 'pause';
    readonly target: SoundId;
}

export interface IResumeAction extends IBaseEventAction {
    readonly type: 'resume';
    readonly target: SoundId;
}

export interface ISetRtpcAction extends IBaseEventAction {
    readonly type: 'set_rtpc';
    readonly param: GameParamId;
    readonly value: number;
}

export interface IStartLoopAction extends IBaseEventAction {
    readonly type: 'start_loop';
    readonly target: SoundId;
    readonly startRegion: RegionId;
}

export interface IStopLoopAction extends IBaseEventAction {
    readonly type: 'stop_loop';
    readonly target: SoundId;
}

export interface IMusicTransitionAction extends IBaseEventAction {
    readonly type: 'music_transition';
    readonly target: SoundId;
    readonly targetRegion: RegionId;
    readonly transitionRegionName?: RegionId;
    readonly options?: Required<ITransitionToParameters>['options'];
}

export interface IPlayStingerAction extends IBaseEventAction {
    readonly type: 'play_stinger';
    readonly target: SoundId;
    readonly quantize?: QuantizeType;
    readonly referenceTrackId?: SoundId;
}

export interface ISetMixerStateAction extends IBaseEventAction {
    readonly type: 'set_mixer_state';
    readonly snapshotName: SnapshotId;
}

export interface IAddMixerModifierAction extends IBaseEventAction {
    readonly type: 'add_mixer_modifier';
    readonly snapshotName: SnapshotId;
    readonly modifierId: LayerId;
    readonly priority?: number;
}

export interface IRemoveMixerModifierAction extends IBaseEventAction {
    readonly type: 'remove_mixer_modifier';
    readonly modifierId: LayerId;
}

export interface ITriggerEventAction extends IBaseEventAction {
    readonly type: 'trigger_event';
    readonly target: EventId;
}

export interface ILoadBankAction extends IBaseEventAction {
    readonly type: 'load_bank';
    readonly target: BankId;
}

export interface IUnloadBankAction extends IBaseEventAction {
    readonly type: 'unload_bank';
    readonly target: BankId;
}

export type EventAction =
    | IPlayAction
    | IStopAction
    | IPauseAction
    | IResumeAction
    | ISetRtpcAction
    | IStartLoopAction
    | IStopLoopAction
    | IMusicTransitionAction
    | IPlayStingerAction
    | ISetMixerStateAction
    | IAddMixerModifierAction
    | IRemoveMixerModifierAction
    | ITriggerEventAction
    | ILoadBankAction
    | IUnloadBankAction;

export interface IEventConfig {
    readonly actions: readonly EventAction[];
}

export interface IEventMap {
    readonly [key: string]: IEventConfig;
}
