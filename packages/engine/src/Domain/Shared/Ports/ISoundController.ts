import type {
    BusId,
    PlaybackId,
    SoundId,
    ArbiterCullReason,
    Milliseconds,
    ContextTime,
    Seconds
} from '@scene-grid/shared';

export interface IControllerPlayOptions {
    readonly when?: ContextTime;
    readonly offset?: Seconds;
    readonly duration?: Seconds;
    readonly loop?: boolean;
    readonly rate?: number;
    readonly onRevive?: (id: PlaybackId) => void;
}

export type RTPCParameterTarget = 'gain' | 'pitch' | 'pan' | 'filterFrequency';

export type PlaybackState = 'playing' | 'virtual' | 'stopped';

export type VirtualReason = ArbiterCullReason | 'VIRTUAL_BY_API';

export interface ISoundController {
    play(soundId: SoundId, options: IControllerPlayOptions): PlaybackId | null;
    stopById(id: PlaybackId, timeToStop?: ContextTime): void;
    stopAll(soundId?: SoundId): void;
    pauseById(id: PlaybackId): void;
    pauseAll(soundId?: SoundId): void;
    resumeById(id: PlaybackId): void;
    resumeAll(soundId?: SoundId): void;
    setVolume(id: PlaybackId, targetVolume: number): void;
    fadeVolume(
        id: PlaybackId,
        targetVolume: number,
        duration: Milliseconds,
        curveType?: 'linear' | 'equal-power',
        delay?: Milliseconds
    ): void;
    getCurrentTime(): ContextTime;
    getSampleRate(): number;
    setPosition(playbackId: PlaybackId, x: number, y: number, z: number): void;
    getPosition(playbackId: PlaybackId): { readonly x: number; readonly y: number; readonly z: number } | undefined;
    cancelScheduled(id: PlaybackId): void;
    onVoiceEnded(id: PlaybackId, callback: () => void): () => void;
    fadeParameter(id: PlaybackId, target: RTPCParameterTarget, targetValue: number, duration: Milliseconds): void;
    getActivePlaybacks(): PlaybackId[];
    getSoundId(id: PlaybackId): SoundId | undefined;
    getPlaybackState(id: PlaybackId): PlaybackState;
    getPlaybackPositionSec(id: PlaybackId): Seconds;
    getCurrentVolume(id: PlaybackId): number;
    getLogicalState(id: PlaybackId): 'playing' | 'paused' | undefined;
    getVirtualReason(playbackId: PlaybackId): VirtualReason | undefined;
    routeToBus(playbackId: PlaybackId, busId: BusId): void;
    addSidechainTrigger(playbackId: PlaybackId, busId: BusId, intensity: number): void;
    removeSidechainTrigger(playbackId: PlaybackId, busId: BusId): void;
    virtualize(id: PlaybackId, reason: VirtualReason): void;
    devirtualize(id: PlaybackId): void;
    playVirtual(soundId: SoundId): PlaybackId;
    crossfade(outId: PlaybackId, inId: PlaybackId, duration: Milliseconds): void;
    isGhostVoice(id: PlaybackId): boolean;
}
