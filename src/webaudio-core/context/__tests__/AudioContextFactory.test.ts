import {
    AudioContext as StdAudioContext,
    OfflineAudioContext as StdOfflineAudioContext
} from 'standardized-audio-context';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import AudioContextFactory from '../AudioContextFactory.js';

vi.mock('standardized-audio-context', () => {
    return {
        AudioContext: vi.fn(),
        OfflineAudioContext: vi.fn()
    };
});

describe('AudioContextFactory', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create realtime context with default latencyHint', () => {
        AudioContextFactory.createRealtime();

        expect(StdAudioContext).toHaveBeenCalledTimes(1);
        expect(StdAudioContext).toHaveBeenCalledWith({
            latencyHint: 'interactive'
        });
    });

    it('should create realtime context with specific sampleRate', () => {
        AudioContextFactory.createRealtime(48_000);

        expect(StdAudioContext).toHaveBeenCalledTimes(1);
        expect(StdAudioContext).toHaveBeenCalledWith({
            latencyHint: 'interactive',
            sampleRate: 48_000
        });
    });

    it('should create offline context with correct parameters', () => {
        const channels = 2;
        const length = 44_100;
        const sampleRate = 44_100;

        AudioContextFactory.createOffline(channels, length, sampleRate);

        expect(StdOfflineAudioContext).toHaveBeenCalledTimes(1);
        expect(StdOfflineAudioContext).toHaveBeenCalledWith(channels, length, sampleRate);
    });
});
