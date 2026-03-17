import type { MixerSnapshot } from 'src/interfaces/IMixerStateManager';

const Snapshots: Record<string, MixerSnapshot> = {
    idle: {
        buses: {
            musicMain: { gain: 1, sends: {}, filter: null, sidechain: { enabled: true } },
            musicExplore: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicCombat: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicLounge: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            sfx: { gain: 1, sends: {}, filter: null, sidechain: { enabled: false } },
            SFX_COINS: { gain: 1, sends: { FX_REVERB: 0.5 }, filter: null, sidechain: { enabled: false } },
            FX_REVERB: {
                gain: 1,
                sends: {},
                filter: { type: 'reverb', reverbTime: 2.5, reverbDecay: 3 },
                sidechain: { enabled: false }
            }
        }
    },

    explore: {
        buses: {
            musicMain: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicExplore: { gain: 1, sends: {}, filter: null, sidechain: { enabled: true } },
            musicCombat: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicLounge: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            sfx: { gain: 1, sends: {}, filter: null, sidechain: { enabled: false } },
            SFX_COINS: { gain: 1, sends: { FX_REVERB: 0.5 }, filter: null, sidechain: { enabled: false } },
            FX_REVERB: {
                gain: 1,
                sends: {},
                filter: { type: 'reverb', reverbTime: 2.5, reverbDecay: 3 },
                sidechain: { enabled: false }
            }
        }
    },

    combat: {
        buses: {
            musicMain: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicExplore: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicCombat: { gain: 1, sends: {}, filter: null, sidechain: { enabled: true } },
            musicLounge: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            sfx: { gain: 1, sends: {}, filter: null, sidechain: { enabled: false } },
            SFX_COINS: { gain: 1, sends: { FX_REVERB: 0.5 }, filter: null, sidechain: { enabled: false } },
            FX_REVERB: {
                gain: 1,
                sends: {},
                filter: { type: 'reverb', reverbTime: 2.5, reverbDecay: 3 },
                sidechain: { enabled: false }
            }
        }
    },

    lounge: {
        buses: {
            musicMain: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicExplore: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicCombat: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicLounge: { gain: 1, sends: {}, filter: null, sidechain: { enabled: true } },
            sfx: { gain: 1, sends: {}, filter: null, sidechain: { enabled: false } },
            SFX_COINS: { gain: 1, sends: { FX_REVERB: 0.5 }, filter: null, sidechain: { enabled: false } },
            FX_REVERB: {
                gain: 1,
                sends: {},
                filter: { type: 'reverb', reverbTime: 2.5, reverbDecay: 3 },
                sidechain: { enabled: false }
            }
        }
    },

    info: {
        buses: {
            musicMain: {
                gain: 1,
                sends: {},
                filter: { type: 'lowpass', frequency: 500 },
                sidechain: { enabled: true }
            },
            musicExplore: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicCombat: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            musicLounge: { gain: 0, sends: {}, filter: null, sidechain: { enabled: true } },
            sfx: { gain: 1, sends: {}, filter: null, sidechain: { enabled: false } },
            SFX_COINS: { gain: 1, sends: { FX_REVERB: 0.5 }, filter: null, sidechain: { enabled: false } },
            FX_REVERB: {
                gain: 1,
                sends: {},
                filter: { type: 'reverb', reverbTime: 2.5, reverbDecay: 3 },
                sidechain: { enabled: false }
            }
        }
    }
};

export default Snapshots;
