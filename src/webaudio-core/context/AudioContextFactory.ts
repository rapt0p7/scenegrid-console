import {
    AudioContext as StdAudioContext,
    OfflineAudioContext as StdOfflineAudioContext
} from 'standardized-audio-context';

import type { AudioCtx } from '@webaudio-core/types/IAudioContext';

const AudioContextFactory = {
    createRealtime(sampleRate?: number): AudioCtx {
        return new StdAudioContext({
            latencyHint: 'interactive',
            ...(sampleRate ? { sampleRate } : {})
        });
    },

    createOffline(channels: number, length: number, sampleRate: number): OfflineAudioContext | StdOfflineAudioContext {
        return new StdOfflineAudioContext(channels, length, sampleRate);
    }
};

export default AudioContextFactory;
