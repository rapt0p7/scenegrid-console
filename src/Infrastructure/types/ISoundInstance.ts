import type { SoundId } from '@shared/Types/Branded.js';
import type { PannerConfig } from '@infrastructure/nodes/AudioNodeFactory.js';
import {
    type AudioNodeLike,
    AudioParamLike,
    PannerNodeLike,
    StereoPannerNodeLike
} from '@infrastructure/types/IAudioContext.js';
import type { IPlaybackController } from '@infrastructure/types/IPlaybackController.js';

export type InstanceParameterTarget = 'gain' | 'pitch' | 'pan' | 'filterFrequency';

export interface ISoundConfig {
    spatial?: PannerConfig;
    hasPanner?: boolean;
}

export interface ISoundInstance extends IPlaybackController {
    readonly id: SoundId;
    readonly gainParam: AudioParamLike;
    readonly pannerNode: PannerNodeLike | StereoPannerNodeLike | null;
    readonly sidechainTriggerNode: AudioNodeLike;
    dispose(): void;
    cancelScheduled(): void;
    connectTo(destination: AudioNodeLike): void;
    forceNaturalEnd(): void;
    disconnectRoute(): void;
    rebind(id: SoundId, buffer: AudioBuffer, config?: ISoundConfig): void;
    resetForReuse(): void;
    virtualize(): void;
    devirtualize(): void;
    on(event: 'ended', handler: (instance: ISoundInstance) => void): () => void;
    on(event: 'stopped', handler: (instance: ISoundInstance) => void): () => void;
    on(event: 'disposed', handler: (instance: ISoundInstance) => void): () => void;
    automate(target: InstanceParameterTarget, mappedValue: number, smoothing: number): void;
    setPosition(x: number, y: number, z: number): void;
}
