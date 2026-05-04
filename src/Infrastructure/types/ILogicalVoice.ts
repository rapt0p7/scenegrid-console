import type { PlaybackId, SoundId } from '@shared/Types/Branded.js';
import type { ISoundInstance } from '@infrastructure/types/ISoundInstance.js';

export interface ILogicalVoice {
    playbackId: number;
    soundId: SoundId;
    logicalState: 'playing' | 'paused';
    position: { x: number; y: number; z: number };
    startedAtContextTime: number;
    startOffset: number;
    physicalInstance: ISoundInstance | null;
    onRevive?: (id: PlaybackId) => void;
}
