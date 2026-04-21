// noinspection D

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type { IDuckingManager } from '@domain/Managers/Ports/IDuckingManager.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { BusId, PlaybackId } from '@shared/Types/Branded.js';

export default class DuckingManager implements IDuckingManager {
    constructor(
        private readonly busSystem: IAudioBusSystem,
        private readonly soundController: ISoundController
    ) {}

    clearAll(): void {
        this.busSystem.clearAllSidechainTriggers();
    }

    public triggerDucking(
        playbackId: PlaybackId,
        targetBuses: BusId | BusId[],
        intensities: number | number[] = 1
    ): void {
        const buses = Array.isArray(targetBuses) ? targetBuses : [targetBuses];
        const intensityArray = Array.isArray(intensities) ? intensities : [intensities];

        for (const [index, busId] of buses.entries()) {
            const intensity = intensityArray[index] ?? 1;
            this.soundController.addSidechainTrigger(playbackId, busId, intensity);
        }
    }
}
