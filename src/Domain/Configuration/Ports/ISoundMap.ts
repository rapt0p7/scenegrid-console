import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { SoundId } from '@domain/Types/Branded.js';

export interface ISoundMap {
    readonly [key: SoundId]: AnySoundConfig;
}
