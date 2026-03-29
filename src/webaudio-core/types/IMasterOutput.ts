import type { AudioNodeLike } from '@webaudio-core/types/IAudioContext.js';

export interface IMasterOutput {
    readonly outputNode: AudioNodeLike;
    readonly volume: number;
    readonly analyserNode: AnalyserNode;
}
