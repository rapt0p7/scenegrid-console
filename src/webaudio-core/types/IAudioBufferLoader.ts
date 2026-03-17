export interface IAudioBufferLoader {
    load(url: string | string[]): Promise<AudioBuffer>;
    clearCache(url?: string): void;
}
