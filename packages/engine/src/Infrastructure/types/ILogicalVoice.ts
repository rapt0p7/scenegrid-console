import type { PlaybackId, SoundId } from '@scene-grid/shared';
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
