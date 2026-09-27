import type { ISnapshot } from '@scene-grid/engine';
import type { BusId } from '@scene-grid/shared';

// eslint-disable-next-line @typescript-eslint/naming-convention
export default {
    idle: {
        buses: {
            ['musicMain' as BusId]: { gain: 1 },
            ['musicExplore' as BusId]: { gain: 0 },
            ['musicCombat' as BusId]: { gain: 0 },
            ['musicLounge' as BusId]: { gain: 0 },
            ['sfx' as BusId]: { gain: 1 },
            ['SFX_COINS' as BusId]: { gain: 1 }
        }
    },

    explore: {
        buses: {
            ['musicMain' as BusId]: { gain: 0 },
            ['musicExplore' as BusId]: { gain: 1 },
            ['musicCombat' as BusId]: { gain: 0 },
            ['musicLounge' as BusId]: { gain: 0 },
            ['sfx' as BusId]: { gain: 1 }
        }
    },

    combat: {
        buses: {
            ['musicMain' as BusId]: { gain: 0 },
            ['musicExplore' as BusId]: { gain: 0 },
            ['musicCombat' as BusId]: { gain: 1 },
            ['musicLounge' as BusId]: { gain: 0 }
        }
    },

    lounge: {
        buses: {
            ['musicMain' as BusId]: { gain: 0 },
            ['musicExplore' as BusId]: { gain: 0 },
            ['musicCombat' as BusId]: { gain: 0 },
            ['musicLounge' as BusId]: { gain: 1 }
        }
    },

    info: {
        buses: {
            ['musicMain' as BusId]: {
                gain: 1,
                filter: { type: 'lowpass', frequency: 500 }
            },
            ['musicExplore' as BusId]: { gain: 0 },
            ['musicCombat' as BusId]: { gain: 0 },
            ['musicLounge' as BusId]: { gain: 0 }
        }
    }
} satisfies Record<string, ISnapshot>;
