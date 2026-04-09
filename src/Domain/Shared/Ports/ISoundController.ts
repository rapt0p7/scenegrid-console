import type { PlaybackId, SoundId } from '@domain/Types/Branded';

export interface IControllerPlayOptions {
    when?: number;
    offset?: number;
    duration?: number;
    loop?: boolean;
    rate?: number;
    onRevive?: (id: PlaybackId) => void;
}

export type RTPCParameterTarget = 'gain' | 'pitch' | 'pan' | 'filterFrequency';

export type PlaybackState = 'playing' | 'virtual' | 'stopped';

export interface ISoundController {
    play(soundId: SoundId, options: IControllerPlayOptions): PlaybackId | null;
    stopById(id: PlaybackId, timeToStop?: number): void;
    stopAll(soundId?: SoundId): void;
    setVolume(id: PlaybackId, targetVolume: number): void;
    fadeVolume(
        id: PlaybackId,
        targetVolume: number,
        durationMs: number,
        curveType?: 'linear' | 'equal-power',
        delayMs?: number
    ): void;
    getCurrentTime(): number;
    getSampleRate(): number;
    setPosition(playbackId: PlaybackId, x: number, y: number, z: number): void;
    cancelScheduled(id: PlaybackId): void;
    onVoiceEnded(id: PlaybackId, callback: () => void): () => void;
    fadeParameter(id: PlaybackId, target: RTPCParameterTarget, targetValue: number, durationMs: number): void;
    getActivePlaybacks(): PlaybackId[];
    getSoundId(id: PlaybackId): string | undefined;
    getPlaybackState(id: PlaybackId): PlaybackState;
    virtualize(id: PlaybackId): void;
    devirtualize(id: PlaybackId): void;
}
