import type { PlaybackId, SoundId, BusId } from '@domain/Types/Branded.js';

export interface CullingContext {
    activePlaybacks: PlaybackId[];
    getSoundId: (id: PlaybackId) => SoundId | undefined;
    getPlaybackState: (id: PlaybackId) => 'playing' | 'virtual' | 'stopped';
    resolveBusId: (id: SoundId) => BusId | undefined;
    getBusVolume: (id: BusId) => number;
}

export interface CullingDecisions {
    toVirtualize: PlaybackId[];
    toDevirtualize: PlaybackId[];
}

export interface ICullingArbiter {
    evaluate(context: CullingContext): CullingDecisions;
}
