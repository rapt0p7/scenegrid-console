import type { AudioCtx } from '@infrastructure/types/IAudioContext.js';

export interface IAudioContextManager {
    readonly context: AudioCtx;
    readonly state: AudioContextState;
    readonly sampleRate: number;
    readonly currentTime: number;

    resume(): Promise<void>;
    suspend(): Promise<void>;
    close(): Promise<void>;
}
