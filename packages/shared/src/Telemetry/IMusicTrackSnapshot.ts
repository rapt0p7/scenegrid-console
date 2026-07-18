import type { RegionId, SoundId } from '../Types/Branded.js';

export interface IMusicTrackSnapshot {
    readonly soundId: SoundId;
    readonly state: 'IDLE' | 'LOOPING' | 'TRANSITIONING';
    readonly currentRegion: RegionId | null;
    readonly targetRegion: RegionId | null;
    readonly queueLength: number;
}
