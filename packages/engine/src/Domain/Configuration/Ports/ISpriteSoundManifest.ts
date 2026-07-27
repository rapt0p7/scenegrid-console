import type { SoundId } from '@scene-grid/shared';

export type ISpriteSoundManifest = Record<
    SoundId,
    {
        readonly url: string;
        readonly priority?: 'high' | 'low';
    }
>;
