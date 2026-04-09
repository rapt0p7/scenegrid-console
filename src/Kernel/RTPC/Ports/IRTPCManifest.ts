export interface IGlobalRTPCParameterConfig {
    attackMs?: number;
    releaseMs?: number;
    defaultValue?: number;
}

export type IRTPCManifest = Record<string, IGlobalRTPCParameterConfig>;
