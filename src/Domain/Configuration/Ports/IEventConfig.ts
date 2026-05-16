import type { GameParamId, SoundId } from '@shared/Types/Branded.js';

export interface IStopOptions {
    readonly allowTail?: boolean;
    readonly fadeOutMs?: number;
}

export type EventAction =
    | { readonly type: 'play'; readonly target: SoundId }
    | { readonly type: 'stop'; readonly target: SoundId; readonly options?: IStopOptions }
    | { readonly type: 'pause'; readonly target: SoundId }
    | { readonly type: 'resume'; readonly target: SoundId }
    | { readonly type: 'set_rtpc'; readonly param: GameParamId; readonly value: number };

export interface IEventConfig {
    readonly actions: readonly EventAction[];
}

export interface IEventMap {
    readonly [key: string]: IEventConfig;
}
