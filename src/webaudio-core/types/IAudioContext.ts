// eslint-disable-next-line unicorn/prevent-abbreviations
export type AudioCtx = AudioContext;
export type AudioNodeLike = AudioNode;
export type GainNodeLike = GainNode;
// eslint-disable-next-line unicorn/prevent-abbreviations
export type AudioParamLike = AudioParam;

export type BiquadFilterNodeLike = BiquadFilterNode;
export type ConstantSourceNodeLike = ConstantSourceNode;
export type DynamicsCompressorNodeLike = DynamicsCompressorNode;
export type AudioBufferSourceNodeLike = AudioBufferSourceNode;
export type DelayNodeLike = DelayNode;
export type AudioWorkletNodeLike = AudioWorkletNode;
export type AudioBufferLike = AudioBuffer;
export type ConvolverNodeNodeLike = ConvolverNode;
export type StereoPannerNodeLike = StereoPannerNode;
export type PannerNodeLike = PannerNode;
export type WaveShaperNodeLike = WaveShaperNode;
export type AudioParameterKeys<T> = {
    [K in keyof T]: T[K] extends AudioParamLike ? K : never;
}[keyof T];
