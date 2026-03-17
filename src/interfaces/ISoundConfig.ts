import type { IRTPCConfig, RTPCTargetProperty } from './IRTPCManager';

export interface ISpatialConfig {
    distanceModel?: DistanceModelType;
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
    panningModel?: PanningModelType;
}

export interface IDuckingConfig {
    target?: string | string[];
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

export interface ISoundConfig {
    busId: string;
    isLoop?: boolean;
    voice?: IVoiceConfig;
    src?: string;
    variation?: IVariationConfig;
    ducking?: IDuckingConfig;
    rtpc?: Partial<Record<RTPCTargetProperty, IRTPCConfig>>;
    spatial?: ISpatialConfig | boolean;
}

export interface ISmartLoopSoundConfig {
    busId: string;
    smartLoop: {
        bpm?: number;
        beatsPerBar?: number;
        crossfade?: number;
        regions: Record<string, [startSample: number, endSample: number]>;
    };
}

export interface IContainerSoundConfig {
    isContainer: true;
    mode: ContainerMode;
    sources: string[];
    busId?: string;
    variation?: IVariationConfig;
    ducking?: IDuckingConfig;
    rtpc?: Partial<Record<RTPCTargetProperty, IRTPCConfig>>;
}

export interface ILayerConfig {
    src: string;
    delayMs: number;
    volume: number;
    rate: number;
}

export interface ILayeredSoundConfig {
    busId: string;
    isLayered: boolean;
    ducking?: IDuckingConfig;
    layers: ILayerConfig[];
}

export interface IPlayOptions {
    isLoop?: boolean;
    rate?: number;
    volume?: number;
    seek?: number;
    on?: {
        event: string;
        callback: Function;
    };
}

export type AnySoundConfig = ISoundConfig | ISmartLoopSoundConfig | IContainerSoundConfig | ILayeredSoundConfig;
