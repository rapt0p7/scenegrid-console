export interface IAudioBufferRequest {
    readonly url: string | readonly string[];
    readonly priority: 'high' | 'low';
    readonly expectedSizeMb: number;
}

export interface IAudioBufferLoader {
    load(request: IAudioBufferRequest): Promise<AudioBuffer>;
    clearCache(url?: string): void;
}
