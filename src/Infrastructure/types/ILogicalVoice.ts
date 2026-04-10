import type { PlaybackId, SoundId } from '@domain/Types/Branded.js';
import type { ISoundInstance } from '@infrastructure/types/ISoundInstance.js';

export interface ILogicalVoice {
    playbackId: number;
    soundId: SoundId;
    position: { x: number; y: number; z: number };
    startedAtContextTime: number;
    startOffset: number;
    physicalInstance: ISoundInstance | null;
    onRevive?: (id: PlaybackId) => void;
}
