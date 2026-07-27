import type { IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';
import type { ISnapshots } from '@domain/Mixer/Ports/ISnapshots.js';
import type { DeepReadonly } from '@scene-grid/shared';
import type { IRTPCManifest } from '@kernel/RTPC/Ports/IRTPCManifest.js';
import type { IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';
import type { IBankManifest } from '@domain/Configuration/Ports/IBankConfig.js';

import type { IMusicFSMConfig } from '@domain/Configuration/Ports/IMusicFSMConfig.js';

export interface IConsistencyCheckerPayload {
    readonly musicFSM?: DeepReadonly<IMusicFSMConfig>;
    readonly soundMap?: ISoundMap;
    readonly manifest?: ISpriteSoundManifest;
    readonly buses?: IBuses;
    readonly snapshots?: ISnapshots;
    readonly rtpcManifest?: IRTPCManifest;
    readonly events?: IEventMap;
    readonly banks?: IBankManifest;
    readonly ramQuotaMb?: number;
    readonly precalculatedSizes?: Record<string, number>;
}
