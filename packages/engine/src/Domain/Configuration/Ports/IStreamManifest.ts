export interface IStreamChunk {
    readonly url: string;
    readonly trimStartSamples: number;
    readonly durationSamples: number;
}

export interface IStreamManifest {
    readonly isLooping: boolean;
    readonly chunks: readonly IStreamChunk[];
}
