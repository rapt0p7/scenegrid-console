import type { IContainerSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { SoundId } from '@domain/Types/Branded.js';

export interface IContainerManager {
    getNextSource(containerId: string, config: IContainerSoundConfig): SoundId | null;
    reset(containerId?: string): void;
}
