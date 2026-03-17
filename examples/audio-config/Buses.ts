export default {
    musicMain: {
        gain: 0
    },
    musicExplore: {
        gain: 0
    },
    musicCombat: {
        gain: 0
    },
    musicLounge: {
        gain: 0
    },
    sfx: {
        gain: 0
    },
    FX_REVERB: {
        gain: 1,
        filter: { type: 'reverb', reverbTime: 2.5, reverbDecay: 3.0 }
    },
    SFX_COINS: {
        gain: 0,
        sends: {
            FX_REVERB: 0.5
        }
    }
} as const;
