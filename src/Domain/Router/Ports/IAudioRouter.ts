import type { AnySoundConfig, IPlayOptions } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { PlaybackId, SoundId } from '@domain/Types/Branded';

export interface IAudioRouter {
    getSoundConfig(name: string): AnySoundConfig | null;
    play(name: SoundId, options?: IPlayOptions): number | number[] | null;
    stop(id: PlaybackId | PlaybackId[] | SoundId): void;
    applyConfigToPlayback(instance: PlaybackId, config: AnySoundConfig): void;
}
