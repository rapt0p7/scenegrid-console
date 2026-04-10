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

    triggerDucking(
        playbackId: PlaybackId,
        targetBusIdOrArray: BusId | BusId[],
        intensity: number | number[] = 1
    ): void {
        const targets = Array.isArray(targetBusIdOrArray) ? targetBusIdOrArray : [targetBusIdOrArray];

        const intensities: number[] = Array.isArray(intensity)
            ? intensity
            : Array.from<number>({ length: targets.length }).fill(intensity);

        for (const [index, busId] of targets.entries()) {
            const currentIntensity = intensities[index] ?? 1;
            this.busSystem.addSidechainTrigger(busId, playbackId, currentIntensity);
        }

        this.soundController.onVoiceEnded(playbackId, () => {
            for (const busId of targets) {
                this.busSystem.removeSidechainTrigger(busId, playbackId);
            }
        });
    }
}
