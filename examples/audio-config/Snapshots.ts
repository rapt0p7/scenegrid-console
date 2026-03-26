import type { ISnapshots } from 'src';

// eslint-disable-next-line @typescript-eslint/naming-convention
const Snapshots: ISnapshots = {
    idle: {
        buses: {
            musicMain: { gain: 1 },
            musicExplore: { gain: 0 },
            musicCombat: { gain: 0 },
            musicLounge: { gain: 0 },
            sfx: { gain: 1 },
            // eslint-disable-next-line @typescript-eslint/naming-convention
            SFX_COINS: { gain: 1 }
        }
    },

    explore: {
        buses: {
            musicMain: { gain: 0 },
            musicExplore: { gain: 1 },
            musicCombat: { gain: 0 },
            musicLounge: { gain: 0 },
            sfx: { gain: 1 }
        }
    },

    combat: {
        buses: {
            musicMain: { gain: 0 },
            musicExplore: { gain: 0 },
            musicCombat: { gain: 1 },
            musicLounge: { gain: 0 }
        }
    },

    lounge: {
        buses: {
            musicMain: { gain: 0 },
            musicExplore: { gain: 0 },
            musicCombat: { gain: 0 },
            musicLounge: { gain: 1 }
        }
    },

    info: {
        buses: {
            musicMain: {
                gain: 1,
                filter: { type: 'lowpass', frequency: 500 }
            },
            musicExplore: { gain: 0 },
            musicCombat: { gain: 0 },
            musicLounge: { gain: 0 }
        }
    }
};

export default Snapshots;
