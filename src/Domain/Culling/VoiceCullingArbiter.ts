import type { CullingContext, CullingDecisions, ICullingArbiter } from '@domain/Culling/Ports/ICullingArbiter.js';

export class VoiceCullingArbiter implements ICullingArbiter {
    constructor(private readonly cullingThreshold: number = 0.01) {}

    public evaluate(context: CullingContext): CullingDecisions {
        const decisions: CullingDecisions = { toVirtualize: [], toDevirtualize: [] };

        for (const playbackId of context.activePlaybacks) {
            const soundId = context.getSoundId(playbackId);
            if (!soundId) continue;

            const busId = context.resolveBusId(soundId);
            if (!busId) continue;

            const currentVolume = context.getBusVolume(busId);
            const isMuted = currentVolume <= this.cullingThreshold;
            const state = context.getPlaybackState(playbackId);

            if (isMuted && state === 'playing') {
                decisions.toVirtualize.push(playbackId);
            } else if (!isMuted && state === 'virtual') {
                decisions.toDevirtualize.push(playbackId);
            }
        }

        return decisions;
    }
}
