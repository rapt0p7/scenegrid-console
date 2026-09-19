import type { AudioCtx } from '@infrastructure/types/IAudioContext.js';

import { Result } from '@scene-grid/shared';

export interface IAudioContextManager {
    readonly context: AudioCtx;
    readonly state: AudioContextState;
    readonly sampleRate: number;
    readonly currentTime: number;

    resume(): Promise<Result<void, Error>>;
    suspend(): Promise<void>;
    close(): Promise<void>;
}
