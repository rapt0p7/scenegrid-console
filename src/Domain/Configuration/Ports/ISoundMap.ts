import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { SoundId } from '@shared/Types/Branded.js';

export interface ISoundMap {
    readonly [key: SoundId]: AnySoundConfig;
}
