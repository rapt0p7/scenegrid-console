import type { GameParamId, Milliseconds } from '@scene-grid/shared';

export interface IGlobalRTPCParameterConfig {
    readonly attack?: Milliseconds;
    readonly release?: Milliseconds;
    readonly defaultValue?: number;
}

export type IRTPCManifest = Record<GameParamId, IGlobalRTPCParameterConfig>;
