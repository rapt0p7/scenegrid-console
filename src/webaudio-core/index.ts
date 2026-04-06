export type {
    AudioCtx,
    AudioNodeLike,
    AudioBufferLike,
    AudioParameterKeys,
    BaseAudioContextLike,
    GainNodeLike,
    BiquadFilterNodeLike,
    ConvolverNodeNodeLike,
    AudioWorkletNodeLike,
    DelayNodeLike,
    StereoPannerNodeLike,
    WaveShaperNodeLike
} from './types/IAudioContext.js';
export type { ISoundInstance, InstanceParameterTarget } from './types/ISoundInstance.js';
export type { ISoundOptions } from './types/ISoundOptions.js';
export type { IVoiceConfig } from './types/IVoiceConfig.js';
export type { ISidechain, IPluginFactory, ILimiterNode } from './types/IAudioPlugins.js';
export type { IAudioWorkletProcessor } from './types/IAudioWorkletProcessor.js';

export { default as AudioContextManager } from './context/AudioContextManager.js';
export { default as AutomationEngine } from './automation/AutomationEngine.js';
export { default as MasterOutput } from './nodes/MasterOutput.js';
export { default as SoundPoolManager } from './instance/SoundPoolManager.js';
export { SoundController } from './loader/SoundController.js';
export { VoiceCullingSystem } from './systems/VoiceCullingSystem.js';
export { SoundInstance } from './instance/SoundInstance.js';
export { AudioBufferLoader } from './loader/AudioBufferLoader.js';
export { PlaybackScheduler } from './scheduling/PlaybackScheduler.js';
export { AudioNodeFactory } from './nodes/AudioNodeFactory.js';
export { default as TinyLimiterNode } from './plugins/TinyLimiterNode.js';
export { default as SidechainDucker } from './plugins/SidechainDucker.js';
export { default as FiltersPlugin } from './plugins/FiltersPlugin.js';
export { safeDisconnect } from './utils/safeDisconnect.js';
export { default as clamp } from './utils/clamp.js';
