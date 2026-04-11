import type { SoundId } from '@domain/Types/Branded.js';
import type {
    AudioNodeLike,
    GainNodeLike,
    PannerNodeLike,
    StereoPannerNodeLike
} from '@infrastructure/types/IAudioContext.js';
import type { IPlaybackController } from '@infrastructure/types/IPlaybackController.js';

export type InstanceParameterTarget = 'gain' | 'pitch' | 'pan' | 'filterFrequency';

export interface ISoundInstance extends IPlaybackController {
    readonly id: SoundId;
    readonly outputNode: AudioNodeLike;
    readonly instanceGain: GainNodeLike;
    readonly pannerNode: PannerNodeLike | StereoPannerNodeLike | null;
    dispose(): void;
    cancelScheduled(): void;
    rebind(id: SoundId, buffer: AudioBuffer): void;
    resetForReuse(): void;
    virtualize(): void;
    devirtualize(): void;
    on(event: 'ended', handler: (instance: ISoundInstance) => void): () => void;
    on(event: 'stopped', handler: (instance: ISoundInstance) => void): () => void;
    on(event: 'disposed', handler: (instance: ISoundInstance) => void): () => void;
    automate(target: InstanceParameterTarget, mappedValue: number, smoothing: number): void;
    setPosition(x: number, y: number, z: number): void;
}
