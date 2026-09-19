import { Result } from '@scene-grid/shared';

export interface IAudioBufferRequest {
    readonly url: string | readonly string[];
    readonly priority: 'high' | 'low';
    readonly expectedSizeMb: number;
}

export interface IAudioBufferLoader {
    load(request: IAudioBufferRequest): Promise<Result<AudioBuffer, Error>>;
    clearCache(url?: string): void;
}
