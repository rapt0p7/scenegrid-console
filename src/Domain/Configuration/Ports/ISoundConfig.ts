import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { BusId, SoundId } from '@domain/Types/Branded.js';

export interface IBaseSoundConfig {
    busId?: BusId;
    variation?: IVariationConfig;
    ducking?: IDuckingConfig;
    rtpc?: Partial<Record<RTPCTargetProperty, IRTPCConfig>>;
}

export interface ISpatialConfig {
    distanceModel?: DistanceModelType;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
    panningModel?: PanningModelType;
}

export interface IDuckingConfig {
    target?: BusId | BusId[];
    intensity?: number;
}

export interface IVariationConfig {
    pitchVar?: number;
    volumeVar?: number;
    randomOffset?: number;
}

export interface IVoiceConfig {
    priority?: number;
    virtualization?: 'kill' | 'virtualize';
}

export type ContainerMode = 'random' | 'random_no_repeat' | 'sequence';

export interface ISoundConfig extends IBaseSoundConfig {
    isLoop?: boolean;
    voice?: IVoiceConfig;
    src?: string;
    spatial?: ISpatialConfig | boolean;
    hasPanner?: boolean;
}

export interface ISmartLoopSoundConfig {
    busId: BusId;
    smartLoop: {
        bpm?: number;
        beatsPerBar?: number;
        crossfade?: number;
        regions: Record<string, [startSample: number, endSample: number]>;
    };
}

export interface IContainerSoundConfig extends IBaseSoundConfig {
    isContainer: true;
    mode: ContainerMode;
    sources: SoundId[];
}

export interface ILayerConfig {
    src: SoundId;
    delayMs: number;
    volume: number;
    rate: number;
}

export interface ILayeredSoundConfig {
    isLayered: true;
    busId: BusId;
    ducking?: IDuckingConfig;
    layers: ILayerConfig[];
}

export interface IPlayOptions {
    isLoop?: boolean;
    rate?: number;
    volume?: number;
    seek?: number;
}

export type AnySoundConfig = ISoundConfig | ISmartLoopSoundConfig | IContainerSoundConfig | ILayeredSoundConfig;
