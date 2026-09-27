import type { IBankManifest } from '@scene-grid/engine';
import type { BankId, SoundId } from '@scene-grid/shared';

export default {
    music: {
        id: 'music' as BankId,
        sounds: ['backgroundMain2', 'backgroundMain3', 'smartLoop'] as SoundId[]
    },
    sfx: {
        id: 'sfx' as BankId,
        sounds: ['kickDrum', 'punchyKick', 'epicSynth', 'collectPoints', 'collectRing', 'tick'] as SoundId[]
    },
    sfx2: {
        id: 'sfx2' as BankId,
        sounds: ['kickDrum2', 'hardstyleKick', 'kbKickMetallic', 'explosion2', 'explosion'] as SoundId[]
    }
} satisfies IBankManifest;
