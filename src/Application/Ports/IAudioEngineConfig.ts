import type { IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type { ISoundMap } from '@domain/Configuration/Ports/ISoundMap.js';
import type { ISpriteSoundManifest } from '@domain/Configuration/Ports/ISpriteSoundManifest.js';
import type { ISnapshots } from '@domain/Mixer/Ports/ISnapshots.js';
import type { IRTPCManifest } from '@kernel/RTPC/Ports/IRTPCManifest.js';

export interface IAudioEngineConfig {
    manifest: ISpriteSoundManifest;
    buses: IBuses;
    snapshots: ISnapshots;
    soundMap: ISoundMap;
    rtpcManifest?: IRTPCManifest;
    globalVoiceLimit?: number;
}
