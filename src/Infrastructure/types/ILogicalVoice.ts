import type { ISoundInstance } from '@infrastructure';

export interface ILogicalVoice {
    playbackId: number;
    soundId: string;
    position: { x: number; y: number; z: number };
    startedAtContextTime: number;
    startOffset: number;
    physicalInstance: ISoundInstance | null;
    onRevive?: (instance: ISoundInstance) => void;
}
