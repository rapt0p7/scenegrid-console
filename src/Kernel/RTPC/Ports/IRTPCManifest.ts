export interface IGlobalRTPCParameterConfig {
    readonly attackMs?: number;
    readonly releaseMs?: number;
    readonly defaultValue?: number;
}

export type IRTPCManifest = Record<string, IGlobalRTPCParameterConfig>;
