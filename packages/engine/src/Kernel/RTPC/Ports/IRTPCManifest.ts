import type { GameParamId } from '@scene-grid/shared';

export interface IGlobalRTPCParameterConfig {
    readonly attackMs?: number;
    readonly releaseMs?: number;
    readonly defaultValue?: number;
}

export type IRTPCManifest = Record<GameParamId, IGlobalRTPCParameterConfig>;
