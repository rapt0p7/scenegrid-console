import type { IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';
import type { ISnapshots } from '@domain/Mixer/Ports/ISnapshots.js';
import type { IRTPCManifest } from '@kernel/RTPC/Ports/IRTPCManifest.js';
import type { IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IBankManifest } from '@domain/Configuration/Ports/IBankConfig.js';
import type { IMusicFSMConfig } from '@domain/Configuration/Ports/IMusicFSMConfig';

export interface IAudioEngineConfig {
    readonly manifest: ISpriteSoundManifest;
    readonly buses: IBuses;
    readonly snapshots: ISnapshots;
    readonly soundMap: ISoundMap;
    readonly rtpcManifest?: IRTPCManifest;
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
}
