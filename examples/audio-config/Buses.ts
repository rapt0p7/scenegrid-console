import type { IBuses } from 'src';

export default {
    musicMain: {
        gain: 1,
        sidechain: {
            enabled: true
        }
    },
    musicExplore: {
        gain: 1,
        sidechain: {
            enabled: true
        }
    },
    musicCombat: {
        gain: 1,
        sidechain: {
            enabled: true
        }
    },
    musicLounge: {
        gain: 1,
        sidechain: {
            enabled: true
        }
    },
    sfx: {
        gain: 1
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    FX_REVERB: {
        gain: 1,
        filter: { type: 'reverb', reverbTime: 2.5, reverbDecay: 3 }
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SFX_COINS: {
        gain: 1,
        sends: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            FX_REVERB: 0.5
        }
    }
} as IBuses;
