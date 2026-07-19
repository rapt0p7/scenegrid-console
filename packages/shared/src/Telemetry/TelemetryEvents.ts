import type { GameParamId, SoundId, PlaybackId, EventId, RegionId, BankId, BusId } from '../Types/Branded.js';
import type { ConditionOperator } from '../Types/Condition.js';
import type { ArbiterCullReason } from '../Types/CullingReasons.js';
import type { IMusicTrackSnapshot } from './IMusicTrackSnapshot.js';

export interface IRtpcSnapshot {
    readonly param: GameParamId;
    readonly value: number;
}

export interface ISwitchSnapshot {
    readonly switchId: SoundId;
    readonly currentKey: number | string | null;
}

export interface IPlaybackSnapshot {
    readonly playbackId: PlaybackId;
    readonly soundId: SoundId;
    readonly positionSec: number;
    readonly volume: number;
    readonly isVirtual: boolean;
    readonly virtualReason?: 'UNDER_THRESHOLD' | 'DEAF_BUS' | 'VIRTUAL_BY_API';
}

export interface IBusSnapshot {
    busId: BusId;
    logicalGain: number;
    rtpcGain: number;
    sidechainGain: number;
    finalGain: number;
    readonly activeModifiers: Array<{ type: string; value: number; source: string }>;
    modifiersCount: number;
}

export interface ITelemetrySnapshot {
    readonly type: 'SNAPSHOT';
    readonly timestampMs: number;
    readonly rtpcs: IRtpcSnapshot[];
    readonly switches: ISwitchSnapshot[];
    readonly activePlaybacks: IPlaybackSnapshot[];
    readonly buses: IBusSnapshot[];
    readonly musicTracks: IMusicTrackSnapshot[];
}

export type LifecycleAction = 'START' | 'STOP' | 'PAUSE' | 'RESUME' | 'VIRTUALIZE' | 'REVIVE';

export interface ITelemetryLifecycleEvent {
    readonly type: 'LIFECYCLE';
    readonly timestampMs: number;
    readonly action: LifecycleAction;
    readonly playbackId: PlaybackId;
    readonly soundId: SoundId;
    readonly reason?: string;
}

export interface IConsistencyReportData {
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
    readonly isConsistent: boolean;
}

export interface ITelemetryConsistencyReport {
    readonly type: 'CONSISTENCY_REPORT';
    readonly timestampMs: number;
    readonly errors: string[];
    readonly warnings: string[];
    readonly isConsistent: boolean;
}

export interface IActionTelemetryDTO {
    readonly type: string;
    readonly target?: SoundId | EventId | BankId;
    readonly param?: GameParamId;
    readonly value?: number;
    readonly [key: string]: any;
}

export type CauseInitiator =
    | { readonly type: 'API'; readonly method: string }
    | { readonly type: 'EVENT'; readonly eventId: EventId }
    | { readonly type: 'MAGNET'; readonly sourceRegion: RegionId; readonly targetRegion: RegionId }
    | { readonly type: 'CONTAINER_POLICY'; readonly containerId: SoundId }
    | { readonly type: 'CULLING_ARBITER'; readonly reason: ArbiterCullReason };

export type CauseResult =
    | { readonly type: 'PLAY'; readonly target: SoundId }
    | { readonly type: 'STOP'; readonly target: SoundId }
    | { readonly type: 'SET_RTPC'; readonly param: GameParamId; readonly value: number }
    | { readonly type: 'TRANSITION'; readonly target: SoundId; readonly toRegion: RegionId }
    | { readonly type: 'ACTION_EXECUTED'; readonly action: IActionTelemetryDTO }
    | { readonly type: 'BLOCKED'; readonly reason: string }
    | { readonly type: 'VIRTUALIZE'; readonly target: PlaybackId }
    | { readonly type: 'KILL'; readonly target: PlaybackId }
    | { readonly type: 'SET_MIX_SNAPSHOT'; readonly snapshotId: string | number; readonly fadeTime: number };

export interface IConditionTrace {
    readonly param: GameParamId;
    readonly operator: ConditionOperator;
    readonly threshold: number;
    readonly actualValue: number;
    readonly passed: boolean;
    readonly hysteresisDeadZone?: [number, number];
}

export interface ITelemetryCauseChain {
    readonly type: 'CAUSE_CHAIN';
    readonly timestampMs: number;
    readonly initiator: CauseInitiator;
    readonly result: CauseResult;
    readonly conditionTrace?: IConditionTrace;
}
