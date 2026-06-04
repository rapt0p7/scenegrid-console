// noinspection D

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type { ICullingContext } from '@domain/Culling/Ports/ICullingArbiter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { PlaybackId, SoundId, BusId } from '@scene-grid/shared';

export class CullingContextProvider implements ICullingContext {
    constructor(
        private readonly soundController: ISoundController,
        private readonly busSystem: IAudioBusSystem,
        private readonly soundMap: ISoundMap
    ) {}

    public get activePlaybacks(): PlaybackId[] {
        return this.soundController.getActivePlaybacks();
    }

    public getSoundId(id: PlaybackId): SoundId | undefined {
        return this.soundController.getSoundId(id);
    }

    public getPlaybackState(id: PlaybackId): 'playing' | 'virtual' | 'stopped' | 'paused' {
        return this.soundController.getPlaybackState(id);
    }

    public getLogicalState(id: PlaybackId): 'playing' | 'paused' | undefined {
        return this.soundController.getLogicalState(id);
    }

    public resolveBusId(id: SoundId): BusId | undefined {
        return this.soundMap[id]?.busId;
    }

    public isGhostVoice(id: PlaybackId): boolean {
        return this.soundController.isGhostVoice(id);
    }

    public getBusVolume(busId: BusId): number {
        const bus = this.busSystem.getBus(busId);
        if (!bus) return 1;

        const realGain = this.busSystem.getCurrentRealGain(busId);

        return Math.max(realGain, bus.logicalTargetGain);
    }
}
