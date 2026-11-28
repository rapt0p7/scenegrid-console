import type { IBankManifest } from '@scene-grid/engine';
import type { SoundId } from '@scene-grid/shared';

export default {
    music: {
        sounds: ['backgroundMain', 'backgroundMain2', 'backgroundMain3', 'smartLoop'] as SoundId[]
    },
    sfx: {
        sounds: ['kickDrum', 'punchyKick', 'epicSynth', 'collectPoints', 'collectRing', 'tick'] as SoundId[]
    },
    sfx2: {
        sounds: ['kickDrum2', 'hardstyleKick', 'kbKickMetallic', 'explosion2', 'explosion'] as SoundId[]
    }
} satisfies IBankManifest;
