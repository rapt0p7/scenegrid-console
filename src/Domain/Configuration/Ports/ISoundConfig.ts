import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { QuantizeType } from '@domain/Shared/Types/Musical.js';
import { BusId, GameParamId, RegionId, SoundId } from '@shared/Types/Branded.js';
import { DeepReadonly } from '@shared/DeepReadonly.js';

export interface IBaseSoundConfig {
    readonly busId?: BusId;
    readonly variation?: DeepReadonly<IVariationConfig>;
    readonly ducking?: DeepReadonly<IDuckingConfig>;
    readonly rtpc?: DeepReadonly<Partial<Record<RTPCTargetProperty, IRTPCConfig>>>;
    readonly tail?: SoundId;
}

export interface ISpatialConfig {
    readonly distanceModel?: DistanceModelType;
    readonly refDistance?: number;
    readonly maxDistance?: number;
    readonly rolloffFactor?: number;
    readonly panningModel?: PanningModelType;
}

export interface IDuckingConfig {
    readonly target?: DeepReadonly<BusId | BusId[]>;
    readonly intensity?: number;
}

export interface IVariationConfig {
    readonly pitchVar?: number;
    readonly volumeVar?: number;
    readonly randomOffset?: number;
}

export interface IVoiceConfig {
    readonly priority?: number;
    readonly virtualization?: 'kill' | 'virtualize';
}

export type ContainerMode = 'random' | 'random_no_repeat' | 'sequence';

export type ContainerSourceItem = SoundId | { id: SoundId; weight: number };

export interface ISoundConfig extends IBaseSoundConfig {
    readonly isLoop?: boolean;
    readonly voice?: IVoiceConfig;
    readonly src?: string;
    readonly spatial?: ISpatialConfig | boolean;
    readonly hasPanner?: boolean;
}

export interface IMagnetConfig {
    readonly region: RegionId;
    readonly targetRegion: RegionId;
    readonly condition: {
        readonly param: GameParamId;
        readonly operator: '>' | '<' | '==' | '>=' | '<=';
        readonly value: number;
    };
    readonly quantize: QuantizeType;
    readonly transitionRegionName?: RegionId;
    readonly crossfadeDuration?: number;
    readonly tailDurationMs?: number;
}

export interface ISmartLoopSoundConfig {
    readonly busId: BusId;
    readonly smartLoop: {
        readonly bpm?: number;
        readonly beatsPerBar?: number;
        readonly crossfade?: number;
        readonly regions: Record<
            RegionId,
            readonly [startSample: number, endSample: number, preEntryMs?: number, tailMs?: number]
        >;
        readonly magnets?: readonly IMagnetConfig[];
    };
}

export interface IContainerSoundConfig extends IBaseSoundConfig {
    readonly isContainer: true;
    readonly mode: ContainerMode;
    readonly sources: ContainerSourceItem[];
    readonly volumeRange?: [min: number, max: number];
    readonly pitchRange?: [min: number, max: number];
}

export interface ISwitchSoundConfig extends IBaseSoundConfig {
    readonly isSwitch: true;
    readonly switchGroup: GameParamId;
    readonly switches: Record<string | number, SoundId>;
    readonly defaultSwitch?: SoundId;
}

export interface ILayerConfig {
    readonly src: SoundId;
    readonly delayMs: number;
    readonly volume: number;
    readonly rate: number;
}

export interface ILayeredSoundConfig {
    readonly isLayered: true;
    readonly busId: BusId;
    readonly ducking?: IDuckingConfig;
    readonly layers: ILayerConfig[];
}

export interface IPlayOptions {
    readonly isLoop?: boolean;
    readonly rate?: number;
    readonly volume?: number;
    readonly seek?: number;
    readonly delayMs?: number;
}

export interface IScattererSyncConfig {
    readonly quantize: QuantizeType;
    readonly referenceTrackId: SoundId;
}

export interface IScattererSoundConfig extends IBaseSoundConfig {
    readonly isScatterer: true;
    readonly sources: readonly ContainerSourceItem[];
    readonly spawnRateMs: readonly [min: number, max: number];
    readonly scatterDistance?: readonly [min: number, max: number];
    readonly maxPolyphony?: number;
    readonly sync?: IScattererSyncConfig;
}

export type AnySoundConfig =
    | ISoundConfig
    | ISmartLoopSoundConfig
    | IContainerSoundConfig
    | ILayeredSoundConfig
    | ISwitchSoundConfig
    | IScattererSoundConfig;
