import { SoundId } from '@shared/Types/Branded.js';

export type ISpriteSoundManifest = Record<
    SoundId,
    {
        readonly url: string;
    }
>;
