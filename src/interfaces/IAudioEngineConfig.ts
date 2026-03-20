import type { IBuses } from './IBuses';
import type { ISnapshots } from './ISnapshots';
import type { ISoundMap } from './ISoundMap';
import type { ISpriteSoundManifest } from './ISpriteSoundManifest';

export interface IAudioEngineConfig {
    manifest: ISpriteSoundManifest;
    buses: IBuses;
    snapshots: ISnapshots;
    soundMap: ISoundMap;
    globalVoiceLimit?: number;
}
