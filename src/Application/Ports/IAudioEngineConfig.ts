import type { IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';
import type { ISnapshots } from '@domain/Mixer/Ports/ISnapshots.js';
import type { IRTPCManifest } from '@kernel/RTPC/Ports/IRTPCManifest.js';
import { IEventMap } from '@domain/Configuration/Ports/IEventConfig.js';

export interface IAudioEngineConfig {
    readonly manifest: ISpriteSoundManifest;
    readonly buses: IBuses;
    readonly snapshots: ISnapshots;
    readonly soundMap: ISoundMap;
    readonly rtpcManifest?: IRTPCManifest;
    readonly events: IEventMap;
    readonly globalVoiceLimit?: number;
    readonly seed?: number;
}
