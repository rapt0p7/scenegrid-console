// noinspection D

import type { IAudioBusSystem } from '@domain/BusSystem/Ports/IAudioBusSystem.js';
import type { IDuckingManager } from '@domain/Managers/Ports/IDuckingManager.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { BusId, PlaybackId } from '@domain/Types/Branded.js';
export default class DuckingManager implements IDuckingManager {
    private readonly busSystem: IAudioBusSystem;
    private readonly soundController: ISoundController;

    constructor(busSystem: IAudioBusSystem, soundController: ISoundController) {
        this.busSystem = busSystem;
        this.soundController = soundController;
    }

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
