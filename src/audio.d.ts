import type {
    IAudioContext,
    IAudioNode,
    IAudioParam,
    IGainNode,
    IBiquadFilterNode,
    IConstantSourceNode,
    IDynamicsCompressorNode,
    IAudioBufferSourceNode,
    IDelayNode,
    IAudioWorkletNode,
    IAudioBuffer,
    IConvolverNode,
    IStereoPannerNode,
    IPannerNode,
    IWaveShaperNode
} from 'standardized-audio-context';

declare global {
    type AudioContext = IAudioContext;
    type AudioNode = IAudioNode<IAudioContext>;
    // eslint-disable-next-line unicorn/prevent-abbreviations
    type AudioParam = IAudioParam;
    type GainNode = IGainNode<IAudioContext>;
    type BiquadFilterNode = IBiquadFilterNode<IAudioContext>;
    type ConstantSourceNode = IConstantSourceNode<IAudioContext>;
    type DynamicsCompressorNode = IDynamicsCompressorNode<IAudioContext>;
    type AudioBufferSourceNode = IAudioBufferSourceNode<IAudioContext>;
    type DelayNode = IDelayNode<IAudioContext>;
    type AudioWorkletNode = IAudioWorkletNode<IAudioContext>;
    type ConvolverNode = IConvolverNode<IAudioContext>;
    type StereoPannerNode = IStereoPannerNode<IAudioContext>;
    type PannerNode = IPannerNode<IAudioContext>;
    type WaveShaperNode = IWaveShaperNode<IAudioContext>;
    type AudioBuffer = IAudioBuffer;
}

// eslint-disable-next-line unicorn/require-module-specifiers
export {};
