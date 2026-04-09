import * as workerTimers from 'worker-timers';

import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';

export interface CullingConfig {
    checkIntervalMs?: number;
    cullingThreshold?: number;
    busIdResolver: (soundId: string) => string | undefined;
    busVolumeResolver: (busId: string) => number;
}

export class VoiceCullingSystem {
    private timerId: number | null = null;
    private readonly checkIntervalMs: number;
    private readonly cullingThreshold: number;

    constructor(
        private readonly controller: ISoundController,
        private readonly config: CullingConfig
    ) {
        this.checkIntervalMs = config.checkIntervalMs ?? 500;
        this.cullingThreshold = config.cullingThreshold ?? 0.01;
    }

    public start(): void {
        if (this.timerId !== null) return;
        this.timerId = workerTimers.setInterval(() => this.tick(), this.checkIntervalMs);
    }

    public stop(): void {
        if (this.timerId !== null) {
            workerTimers.clearInterval(this.timerId);
            this.timerId = null;
        }
    }

    private tick(): void {
        const activePlaybacks = this.controller.getActivePlaybacks();

        for (const playbackId of activePlaybacks) {
            const soundId = this.controller.getSoundId(playbackId);
            if (!soundId) continue;

            const busId = this.config.busIdResolver(soundId);
            if (!busId) continue;

            const currentVolume = this.config.busVolumeResolver(busId);
            const isMuted = currentVolume <= this.cullingThreshold;
            const state = this.controller.getPlaybackState(playbackId);

            if (isMuted && state === 'playing') {
                this.controller.virtualize(playbackId);
            } else if (!isMuted && state === 'virtual') {
                this.controller.devirtualize(playbackId);
            }
        }
    }
}
