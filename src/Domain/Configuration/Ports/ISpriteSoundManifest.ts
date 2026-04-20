import { SoundId } from '@domain/Types/Branded.js';

export type ISpriteSoundManifest = Record<
    SoundId,
    {
        readonly url: string;
    }
>;
