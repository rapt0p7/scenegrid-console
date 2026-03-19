import type { IBuses } from './IBuses';
import type { MixerSnapshot } from './IMixerStateManager';
import type { ISoundMap } from './ISoundMap';
import type { ISpriteSoundManifest } from './ISpriteSoundManifest';

export interface IAudioEngineConfig {
    manifest: ISpriteSoundManifest;
    buses: IBuses;
    snapshots: Record<string, MixerSnapshot>;
    soundMap: ISoundMap;
    globalVoiceLimit?: number;
}
