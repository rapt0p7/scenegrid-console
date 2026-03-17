import type {
    IAudioContext,
    IAudioNode,
    IGainNode,
    IAudioParam,
    IBiquadFilterNode,
    IConstantSourceNode,
    IDynamicsCompressorNode,
    IAudioBufferSourceNode,
    IDelayNode,
    IAudioWorkletNode,
    IAudioBuffer,
    IConvolverNode,
    IStereoPannerNode,
    IPannerNode
} from 'standardized-audio-context';

export type AudioCtx = IAudioContext;
export type AudioNodeLike = IAudioNode<AudioCtx>;
export type GainNodeLike = IGainNode<AudioCtx>;
export type BiquadFilterNodeLike = IBiquadFilterNode<AudioCtx>;
export type ConstantSourceNodeLike = IConstantSourceNode<AudioCtx>;
export type DynamicsCompressorNodeLike = IDynamicsCompressorNode<AudioCtx>;
export type AudioParamLike = IAudioParam;
export type AudioBufferSourceNodeLike = IAudioBufferSourceNode<AudioCtx>;
export type DelayNodeLike = IDelayNode<AudioCtx>;
export type AudioWorkletNodeLike = IAudioWorkletNode<AudioCtx>;
export type AudioBufferLike = IAudioBuffer;
export type ConvolverNodeNodeLike = IConvolverNode<AudioCtx>;
export type StereoPannerNodeLike = IStereoPannerNode<AudioCtx>;
export type PannerNodeLike = IPannerNode<AudioCtx>;
