import type { IBankManifest, BankId, SoundId } from '@scene-grid/engine';

export default {
    music: {
        id: 'music' as BankId,
        sounds: ['backgroundMain', 'backgroundMain2', 'backgroundMain3'] as SoundId[]
    },
    sfx: {
        id: 'sfx' as BankId,
        sounds: ['kickDrum', 'punchyKick', 'epicSynth', 'collectPoints', 'collectRing', 'tick'] as SoundId[]
    },
    sfx2: {
        id: 'sfx2' as BankId,
        sounds: ['kickDrum2', 'hardstyleKick', 'kbKickMetallic', 'explosion2', 'explosion'] as SoundId[]
    }
} as IBankManifest;
