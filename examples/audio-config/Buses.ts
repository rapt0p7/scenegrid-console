import type { IBuses } from 'src';

export default {
    musicMain: {
        gain: 0,
        sidechain: {
            enabled: true
        }
    },
    musicExplore: {
        gain: 0,
        sidechain: {
            enabled: true
        }
    },
    musicCombat: {
        gain: 0,
        sidechain: {
            enabled: true
        }
    },
    musicLounge: {
        gain: 0,
        sidechain: {
            enabled: true
        }
    },
    sfx: {
        gain: 0
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    FX_REVERB: {
        gain: 1,
        filter: { type: 'reverb', reverbTime: 2.5, reverbDecay: 3 }
    },
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SFX_COINS: {
        gain: 0,
        sends: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            FX_REVERB: 0.5
        }
    }
} as IBuses;
