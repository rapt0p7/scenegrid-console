import type { IBuses } from './IBuses.js';
import type { IRTPCManifest } from './IRTPCManifest.js';
import type { ISnapshots } from './ISnapshots.js';
import type { ISoundMap } from './ISoundMap.js';
import type { ISpriteSoundManifest } from './ISpriteSoundManifest.js';

export interface IAudioEngineConfig {
    manifest: ISpriteSoundManifest;
    buses: IBuses;
    snapshots: ISnapshots;
    soundMap: ISoundMap;
    rtpcManifest?: IRTPCManifest;
    globalVoiceLimit?: number;
}
