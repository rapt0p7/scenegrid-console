import * as workerTimers from 'worker-timers';

import type { SoundPoolManager } from '@infrastructure';

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
        private readonly pool: SoundPoolManager,
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
        const activeVoices = this.pool.getActiveVoices();

        for (const instance of activeVoices) {
            const busId = this.config.busIdResolver(instance.id);
            if (!busId) continue;

            const currentVolume = this.config.busVolumeResolver(busId);
            const isMuted = currentVolume <= this.cullingThreshold;

            if (isMuted && instance.state === 'playing' && 'virtualize' in instance) {
                instance.virtualize();
            } else if (!isMuted && instance.state === 'virtual' && 'devirtualize' in instance) {
                instance.devirtualize();

                if ('onRevive' in instance && typeof (instance as any).onRevive === 'function') {
                    (instance as any).onRevive(instance);
                }
            }
        }
    }
}
