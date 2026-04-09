import type { AudioNodeLike } from '@infrastructure/types/IAudioContext.js';

export interface IMasterOutput {
    readonly input: AudioNodeLike;
    readonly outputNode: AudioNodeLike;
    readonly volume: number;
    readonly analyserNode: AnalyserNode;
}
