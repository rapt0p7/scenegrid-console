import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type {
    BusId,
    GameParamId,
    RegionId,
    SoundId,
    QuantizeType,
    DeepReadonly,
    IConditionConfig,
    Milliseconds,
    Samples,
    BPM,
    ContextTime,
    Beats
} from '@scene-grid/shared';

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
    /** Game voice-stealing priority (higher values win limited voice slots). Separate from manifest/asset routing priority. */
    readonly priority?: number;
    readonly virtualization?: 'kill' | 'virtualize';
}

export type ContainerMode = 'random' | 'random_no_repeat' | 'sequence';

export type ContainerSourceItem = SoundId | { id: SoundId; weight: number };

export interface ISoundConfig extends IBaseSoundConfig {
    readonly busId: BusId;
    readonly isLoop?: boolean;
    readonly voice?: IVoiceConfig;
    readonly spatial?: ISpatialConfig | boolean;
    readonly hasPanner?: boolean;
}

export interface IMagnetConfig {
    readonly region: RegionId;
    readonly targetRegion: RegionId;
    readonly condition: IConditionConfig;
    readonly quantize: QuantizeType;
    readonly transitionRegionName?: RegionId;
    readonly crossfadeDuration?: Milliseconds;
    readonly tailDuration?: Milliseconds;
    readonly offsetMode?: 'None' | 'Relative' | 'Inverted';
}

export interface ISmartLoopSoundConfig {
    readonly busId: BusId;
    readonly smartLoop: {
        readonly bpm?: BPM;
        readonly beatsPerBar?: Beats;
        readonly crossfade?: Milliseconds;
        readonly regions: Record<
            RegionId,
            readonly [startSample: Samples, endSample: Samples, preEntry?: Milliseconds, tail?: Milliseconds]
        >;
        readonly magnets?: readonly IMagnetConfig[];
    };
}

export interface IContainerSoundConfig extends IBaseSoundConfig {
    readonly isContainer: true;
    readonly mode: ContainerMode;
    readonly sources: readonly ContainerSourceItem[];
    readonly volumeRange?: readonly [min: number, max: number];
    readonly pitchRange?: readonly [min: number, max: number];
}

/**
 * Conditional switch container routing playback to a selected child sound.
 * When `busId` is omitted, playback follows the selected child sound's effective bus.
 * When `busId` is supplied, it acts as an explicit routing override that the child does not override.
 */
export interface ISwitchSoundConfig extends IBaseSoundConfig {
    readonly isSwitch: true;
    readonly switchGroup: GameParamId;
    readonly switches: Record<string | number, SoundId>;
    readonly defaultSwitch?: SoundId;
    readonly hysteresis?: number;
}

export interface ILayerConfig {
    readonly src: SoundId;
    readonly delay: Milliseconds;
    readonly volume: number;
    readonly rate: number;
}

export interface ILayeredSoundConfig {
    readonly isLayered: true;
    readonly busId: BusId;
    readonly ducking?: IDuckingConfig;
    readonly layers: readonly ILayerConfig[];
}

export interface IPlayOptions {
    readonly isLoop?: boolean;
    readonly rate?: number;
    readonly volume?: number;
    readonly seek?: Milliseconds;
    readonly delay?: Milliseconds;
    readonly when?: ContextTime;
}

export interface IScattererSyncConfig {
    readonly quantize: QuantizeType;
    readonly referenceTrackId: SoundId;
}

/**
 * Periodic spatial emitter container.
 * Scatterers do not support scatterer-level `busId` routing overrides; spawned voices inherit routing from their child sound configurations.
 */
export interface IScattererSoundConfig extends Omit<IBaseSoundConfig, 'busId'> {
    readonly isScatterer: true;
    readonly sources: readonly ContainerSourceItem[];
    readonly spawnRate: readonly [min: Milliseconds, max: Milliseconds];
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
