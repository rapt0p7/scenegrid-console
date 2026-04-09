import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';

export interface ISoundMap {
    [key: string]: AnySoundConfig;
}
