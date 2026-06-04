import type { BusId, PlaybackId, SoundId } from '@scene-grid/shared';

export interface IControllerPlayOptions {
    readonly when?: number;
    readonly offset?: number;
    readonly duration?: number;
    readonly loop?: boolean;
    readonly rate?: number;
    readonly onRevive?: (id: PlaybackId) => void;
}

export type RTPCParameterTarget = 'gain' | 'pitch' | 'pan' | 'filterFrequency';

export type PlaybackState = 'playing' | 'virtual' | 'stopped';

export interface ISoundController {
    play(soundId: SoundId, options: IControllerPlayOptions): PlaybackId | null;
    stopById(id: PlaybackId, timeToStop?: number): void;
    stopAll(soundId?: SoundId): void;
    pauseById(id: PlaybackId): void;
    pauseAll(soundId?: SoundId): void;
    resumeById(id: PlaybackId): void;
    resumeAll(soundId?: SoundId): void;
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
    getPosition(playbackId: PlaybackId): { readonly x: number; readonly y: number; readonly z: number } | undefined;
    cancelScheduled(id: PlaybackId): void;
    onVoiceEnded(id: PlaybackId, callback: () => void): () => void;
    fadeParameter(id: PlaybackId, target: RTPCParameterTarget, targetValue: number, durationMs: number): void;
    getActivePlaybacks(): PlaybackId[];
    getSoundId(id: PlaybackId): SoundId | undefined;
    getPlaybackState(id: PlaybackId): PlaybackState;
    getLogicalState(id: PlaybackId): 'playing' | 'paused' | undefined;
    routeToBus(playbackId: PlaybackId, busId: BusId): void;
    addSidechainTrigger(playbackId: PlaybackId, busId: BusId, intensity: number): void;
    removeSidechainTrigger(playbackId: PlaybackId, busId: BusId): void;
    virtualize(id: PlaybackId): void;
    devirtualize(id: PlaybackId): void;
    playVirtual(soundId: SoundId): PlaybackId;
    isGhostVoice(id: PlaybackId): boolean;
}
