import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { SoundId } from '@scene-grid/shared';

export interface ISoundMap {
    readonly [key: SoundId]: AnySoundConfig;
}
