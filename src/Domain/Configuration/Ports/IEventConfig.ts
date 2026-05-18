import { GameParamId, LayerId, RegionId, SnapshotId, SoundId } from '@shared/Types/Branded.js';
import { ITransitionToParameters } from '@domain/Orchestration/Ports/ISequencer.js';

export interface IStopOptions {
    readonly allowTail?: boolean;
    readonly fadeOutMs?: number;
}

export type EventAction =
    | { readonly type: 'play'; readonly target: SoundId }
    | { readonly type: 'stop'; readonly target: SoundId; readonly options?: IStopOptions }
    | { readonly type: 'pause'; readonly target: SoundId }
    | { readonly type: 'resume'; readonly target: SoundId }
    | { readonly type: 'set_rtpc'; readonly param: GameParamId; readonly value: number }
    | {
          readonly type: 'start_loop';
          readonly target: SoundId;
          readonly startRegion: RegionId;
      }
    | {
          readonly type: 'stop_loop';
          readonly target: SoundId;
      }
    | {
          readonly type: 'music_transition';
          readonly target: SoundId;
          readonly targetRegion: RegionId;
          readonly transitionRegionName?: RegionId;
          readonly options?: Required<ITransitionToParameters>['options'];
      }
    | {
          readonly type: 'play_stinger';
          readonly target: SoundId;
          readonly quantize?: 'Immediate' | 'NextBeat' | 'NextBar';
          readonly referenceTrackId?: SoundId;
      }
    | {
          readonly type: 'set_mixer_state';
          readonly snapshotName: SnapshotId;
      }
    | {
          readonly type: 'add_mixer_modifier';
          readonly snapshotName: SnapshotId;
          readonly modifierId: LayerId;
          readonly priority?: number;
      }
    | {
          readonly type: 'remove_mixer_modifier';
          readonly modifierId: LayerId;
      };

export interface IEventConfig {
    readonly actions: readonly EventAction[];
}

export interface IEventMap {
    readonly [key: string]: IEventConfig;
}
