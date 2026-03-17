import type { AudioCtx } from '@webaudio-core/types/IAudioContext';

export interface IAudioContextManager {
    readonly context: AudioCtx;
    readonly state: AudioContextState;
    readonly sampleRate: number;
    readonly currentTime: number;

    resume(): Promise<void>;
    suspend(): Promise<void>;
    close(): Promise<void>;
}
