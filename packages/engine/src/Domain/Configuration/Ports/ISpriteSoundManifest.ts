import type { SoundId } from '@scene-grid/shared';

export type ISpriteSoundManifest = Record<
    SoundId,
    {
        readonly url: string | readonly string[];
        /**
         * Asset loading and RAM-quota routing priority (`'high' | 'low'`, runtime default `'low'`).
         * Separate from game voice-stealing priority in `IVoiceConfig.priority`.
         */
        readonly priority?: 'high' | 'low';
        readonly isStream?: boolean;
    }
>;
