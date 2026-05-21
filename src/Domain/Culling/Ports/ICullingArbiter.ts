import type { PlaybackId, SoundId, BusId } from '@shared/Types/Branded.js';

export interface ICullingContext {
    readonly activePlaybacks: PlaybackId[];
    readonly getSoundId: (id: PlaybackId) => SoundId | undefined;
    readonly getPlaybackState: (id: PlaybackId) => 'playing' | 'virtual' | 'stopped' | 'paused';
    readonly getLogicalState: (id: PlaybackId) => 'playing' | 'paused' | undefined;
    readonly resolveBusId: (id: SoundId) => BusId | undefined;
    readonly getBusVolume: (id: BusId) => number;
    readonly isGhostVoice: (id: PlaybackId) => boolean;
}

export interface CullingDecisions {
    readonly toVirtualize: PlaybackId[];
    readonly toDevirtualize: PlaybackId[];
}

export interface ICullingArbiter {
    evaluate(context: ICullingContext, deltaTimeMs: number): CullingDecisions;
}
