import type { AudioNodeLike } from '@webaudio-core/types/IAudioContext';

export interface IMasterOutput {
    readonly outputNode: AudioNodeLike;
    readonly volume: number;
    readonly analyserNode: AnalyserNode;
}
