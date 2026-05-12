import type { AnySoundConfig, IPlayOptions } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { PlaybackId, SoundId } from '@shared/Types/Branded.js';

export interface IAudioRouter {
    getSoundConfig(name: string): AnySoundConfig | null;
    play(name: SoundId, options?: IPlayOptions, depth?: number): number | number[] | null;
    stop(id: PlaybackId | PlaybackId[] | SoundId): void;
    pause(id: PlaybackId | PlaybackId[] | SoundId): void;
    resume(id: PlaybackId | PlaybackId[] | SoundId): void;
    applyConfigToPlayback(instance: PlaybackId, config: AnySoundConfig): void;
}
