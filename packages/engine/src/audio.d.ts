import type {
    IAudioContext,
    IAudioNode,
    IAudioParam,
    IGainNode,
    IBaseAudioContext,
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
    type BaseAudioContext = IBaseAudioContext;
}

// oxlint-disable-next-line unicorn/require-module-specifiers
export {};
