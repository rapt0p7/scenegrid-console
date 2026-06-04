import {
    AudioContext as StdAudioContext,
    OfflineAudioContext as StdOfflineAudioContext
} from 'standardized-audio-context';

import type { AudioCtx } from '@infrastructure/types/IAudioContext.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const AudioContextFactory = {
    createRealtime(sampleRate?: number): AudioCtx {
        return new StdAudioContext({
            latencyHint: 'interactive',
            ...(sampleRate ? { sampleRate } : {})
        }) as unknown as AudioCtx;
    },

    createOffline(channels: number, length: number, sampleRate: number): OfflineAudioContext | StdOfflineAudioContext {
        return new StdOfflineAudioContext(channels, length, sampleRate);
    }
};

export default AudioContextFactory;
