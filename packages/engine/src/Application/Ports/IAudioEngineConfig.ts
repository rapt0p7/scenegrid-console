import type { IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type { IAudioBufferLoaderOptions } from '@domain/Configuration/Ports/IAudioBufferLoaderOptions.js';
import type { IBankManifest } from '@domain/Configuration/Ports/IBankConfig.js';
import type { IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IMusicFSMConfig } from '@domain/Configuration/Ports/IMusicFSMConfig';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';
import type { ISnapshots } from '@domain/Mixer/Ports/ISnapshots.js';
import type { IRTPCManifest } from '@kernel/RTPC/Ports/IRTPCManifest.js';

export interface IAudioEngineConfig {
    readonly manifest: ISpriteSoundManifest;
    readonly buses: IBuses;
    /** Mixer snapshots keyed by snapshot ID. An empty object `{}` is valid for minimal projects; no default snapshot is assumed at runtime. */
    readonly snapshots: ISnapshots;
    readonly soundMap: ISoundMap;
    readonly rtpcManifest?: IRTPCManifest;
    /** Event definitions keyed by event ID. An empty object `{}` is valid for minimal projects. */
    readonly events: IEventMap;
    readonly musicFSM?: IMusicFSMConfig;
    readonly banks: IBankManifest;
    readonly globalVoiceLimit?: number;
    readonly seed?: number;
    readonly ramQuotaMb?: number;
    readonly precalculatedSizes?: Record<string, number>;
    readonly sequencer?: {
        readonly ppqn?: 96 | 192 | 480 | 960;
    };
    readonly remoteSyncUri?: string;
    readonly loaderOptions?: IAudioBufferLoaderOptions;
}
