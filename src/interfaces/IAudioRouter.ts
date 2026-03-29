import type { AnySoundConfig, IPlayOptions } from './ISoundConfig.js';
import type { ISoundInstance } from '@webaudio-core';

export interface IAudioRouter {
    getSoundConfig(name: string): AnySoundConfig | null;
    play(name: string, options?: IPlayOptions): number | number[] | null;
    stop(id: number | number[] | string): void;
    applyConfigToInstance(instance: ISoundInstance, config: AnySoundConfig): void;
}
