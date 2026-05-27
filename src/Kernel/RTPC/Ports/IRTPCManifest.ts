import type { GameParamId } from '@shared/Types/Branded.js';

export interface IGlobalRTPCParameterConfig {
    readonly attackMs?: number;
    readonly releaseMs?: number;
    readonly defaultValue?: number;
}

export type IRTPCManifest = Record<GameParamId, IGlobalRTPCParameterConfig>;
