// noinspection D

import type { ICullingContext, CullingDecisions, ICullingArbiter } from '@domain/Culling/Ports/ICullingArbiter.js';
import type { PlaybackId } from '@scene-grid/shared';

export class VoiceCullingArbiter implements ICullingArbiter {
    private readonly muteTimers = new Map<PlaybackId, number>();
    private readonly decisions: CullingDecisions = { toVirtualize: [], toDevirtualize: [] };

    constructor(
        private readonly cullingThreshold: number = 0.01,
        private readonly hysteresisMs: number = 1000
    ) {}

    // oxlint-disable-next-line max-lines-per-function
    public evaluate(context: ICullingContext, deltaTimeMs: number): CullingDecisions {
        this.decisions.toVirtualize.length = 0;
        this.decisions.toDevirtualize.length = 0;

        const activePlaybacks = context.activePlaybacks;

        for (const id of this.muteTimers.keys()) {
            if (!activePlaybacks.includes(id)) {
                this.muteTimers.delete(id);
            }
        }

        const length = activePlaybacks.length;
        for (let i = 0; i < length; i++) {
            const playbackId = activePlaybacks[i];

            if (context.isGhostVoice(playbackId)) continue;

            const soundId = context.getSoundId(playbackId);
            if (!soundId) continue;

            const busId = context.resolveBusId(soundId);
            if (!busId) continue;

            const currentVolume = context.getBusVolume(busId);
            const isMuted = currentVolume <= this.cullingThreshold;

            const physicalState = context.getPlaybackState(playbackId);
            const logicalState = context.getLogicalState(playbackId);

            if (isMuted) {
                const timeMuted = (this.muteTimers.get(playbackId) ?? 0) + deltaTimeMs;
                this.muteTimers.set(playbackId, timeMuted);

                if (timeMuted >= this.hysteresisMs && physicalState !== 'virtual' && physicalState !== 'stopped') {
                    this.decisions.toVirtualize.push(playbackId);
                }
            } else {
                this.muteTimers.delete(playbackId);

                if (physicalState === 'virtual' && logicalState === 'playing') {
                    this.decisions.toDevirtualize.push(playbackId);
                }
            }
        }

        return this.decisions;
    }
}
