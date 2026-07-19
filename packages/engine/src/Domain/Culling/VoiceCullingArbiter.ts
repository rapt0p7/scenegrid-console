// noinspection D

import type {
    ICullingContext,
    CullingDecisions,
    ICullingArbiter,
    IVirtualizeDecision
} from '@domain/Culling/Ports/ICullingArbiter.js';
import type { Milliseconds, PlaybackId } from '@scene-grid/shared';

export class VoiceCullingArbiter implements ICullingArbiter {
    private readonly muteTimers = new Map<PlaybackId, Milliseconds>();
    private readonly virtualizePool: IVirtualizeDecision[];
    private readonly devirtualizePool: PlaybackId[];
    private readonly decisions: CullingDecisions;

    constructor(
        private readonly cullingThreshold: number = 0.01,
        private readonly hysteresis: Milliseconds = 1000 as Milliseconds,
        maxPlaybacks: number = 128
    ) {
        this.virtualizePool = Array.from({ length: maxPlaybacks }, () => ({
            playbackId: 0 as PlaybackId,
            reason: 'DEAF_BUS'
        }));
        // oxlint-disable-next-line unicorn/no-new-array
        this.devirtualizePool = new Array(maxPlaybacks).fill(0);

        this.decisions = {
            toVirtualize: this.virtualizePool,
            virtualizeCount: 0,
            toDevirtualize: this.devirtualizePool,
            devirtualizeCount: 0
        };
    }

    // oxlint-disable-next-line max-lines-per-function
    public evaluate(context: ICullingContext, deltaTime: Milliseconds): CullingDecisions {
        let virtCount = 0;
        let devirtCount = 0;

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
                const timeMuted = ((this.muteTimers.get(playbackId) ?? 0) + deltaTime) as Milliseconds;
                this.muteTimers.set(playbackId, timeMuted);

                if (timeMuted >= this.hysteresis && physicalState !== 'virtual' && physicalState !== 'stopped') {
                    const poolItem = this.virtualizePool[virtCount++];
                    // oxlint-disable-next-line typescript/no-explicit-any
                    (poolItem as any).playbackId = playbackId;
                    // oxlint-disable-next-line typescript/no-explicit-any
                    (poolItem as any).reason = 'DEAF_BUS';
                }
            } else {
                this.muteTimers.delete(playbackId);

                if (physicalState === 'virtual' && logicalState === 'playing') {
                    this.devirtualizePool[devirtCount++] = playbackId;
                }
            }
        }

        // oxlint-disable-next-line typescript/no-explicit-any
        (this.decisions as any).virtualizeCount = virtCount;
        // oxlint-disable-next-line typescript/no-explicit-any
        (this.decisions as any).devirtualizeCount = devirtCount;

        return this.decisions;
    }
}
