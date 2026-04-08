import type { AudioNodeLike } from '@infrastructure/types/IAudioContext.js';

export interface IMasterOutput {
    readonly outputNode: AudioNodeLike;
    readonly volume: number;
    readonly analyserNode: AnalyserNode;
}
