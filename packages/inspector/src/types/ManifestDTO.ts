export interface IEngineManifestDTO {
    readonly buses: Record<
        string,
        {
            readonly gain?: number;
            readonly sends?: Record<string, number>;
        }
    >;
    readonly soundMap: Record<
        string,
        {
            readonly busId?: string;
            readonly ducking?: {
                readonly target: string[];
                readonly intensity?: number;
            };
        }
    >;
    readonly events?: Record<string, any>;
    readonly rtpcManifest?: Record<string, { readonly defaultValue?: number }>;
}
