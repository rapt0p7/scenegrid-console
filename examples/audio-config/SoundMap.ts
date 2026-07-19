/* eslint-disable @typescript-eslint/naming-convention */
export default {
    'backgroundMain': { busId: 'musicMain', isLoop: true, tail: 'kickDrum2' },
    'backgroundMain2': { busId: 'musicExplore', isLoop: true },
    'backgroundMain3': { busId: 'musicCombat', isLoop: true },

    'synthPadLoop': { busId: 'musicLounge', isLoop: true },
    'technoLiveLoop': { busId: 'musicLounge', isLoop: true },
    'synthPadLoopDMinor': { busId: 'musicLounge', isLoop: true },
    '188BpmSynthLayeredPadLoop': { busId: 'musicLounge', isLoop: true },
    'drumBeatLoopable': { busId: 'musicLounge', isLoop: true },
    'pad': { busId: 'musicLounge', isLoop: true },
    'drumsLoop80bpm': { busId: 'musicLounge', isLoop: true },
    '120bpmDrumLoop': { busId: 'musicLounge', isLoop: true },

    'kickDrum': { busId: 'sfx', ducking: { target: ['musicCombat', 'musicLounge'], intensity: 1, duration: 1500 } },
    'punchyKick': { busId: 'sfx', ducking: { target: ['musicCombat', 'musicLounge'], intensity: 1, duration: 1500 } },
    'epicSynth': { busId: 'sfx', ducking: { target: ['musicCombat', 'musicLounge'], intensity: 0.2, duration: 1500 } },
    'explosion': { busId: 'sfx', ducking: { target: ['musicCombat', 'musicLounge'], intensity: 1, duration: 1500 } },
    'explosion2': { busId: 'sfx', ducking: { target: ['musicCombat', 'musicLounge'], intensity: 1, duration: 1500 } },
    'heavyKick': { busId: 'sfx', ducking: { target: ['musicCombat', 'musicLounge'], intensity: 1, duration: 1500 } },
    'kbKickMetallic': {
        busId: 'sfx',
        ducking: { target: ['musicCombat', 'musicLounge'], intensity: 1, duration: 1500 }
    },
    'hardstyleKick': {
        busId: 'sfx',
        ducking: { target: ['musicCombat', 'musicLounge'], intensity: 1, duration: 1500 }
    },
    'collectPoints': {
        busId: 'SFX_COINS',
        ducking: { target: ['musicCombat', 'musicLounge'], intensity: 1, duration: 1500 }
    },
    'kickDrum2': { busId: 'sfx', ducking: { target: ['musicCombat', 'musicLounge'], intensity: 1, duration: 1500 } },
    'collectRing': {
        busId: 'SFX_COINS',
        ducking: { target: ['musicCombat', 'musicLounge'], intensity: 1, duration: 1500 }
    },

    'tick': { busId: 'sfx', variation: { pitchVar: 0.1, volumeVar: 0.1, randomOffset: 0.01 } },

    'scatterer': {
        isScatterer: true,
        busId: 'sfx',
        sources: ['tick'],
        spawnRate: [1000, 2000],
        maxPolyphony: 5
    },

    'kick': {
        isSwitch: true,
        busId: 'sfx',
        switchGroup: 'kickType',
        switches: {
            0: 'kickDrum',
            1: 'kickDrum2'
        },
        defaultSwitch: 'kickDrum'
    },

    'kicks': {
        isContainer: true,
        busId: 'sfx',
        mode: 'random_no_repeat',
        sources: ['kickDrum', 'kickDrum2', 'kbKickMetallic', 'hardstyleKick']
    },

    'smartLoop': {
        busId: 'musicMain',
        smartLoop: {
            bpm: 120,
            crossfade: 4000,
            regions: {
                A: [1057706, 1763630],
                B: [1763630, 2469413],
                C: [2469413, 3175081],
                A_TO_B: [3527999, 3704386],
                A_TO_C: [3527999, 3704386],
                B_TO_C: [3527999, 3704386],
                B_TO_A: [3527999, 3704386],
                C_TO_A: [3527999, 3704386],
                C_TO_B: [3527999, 3704386]
            }
        }
    }
};
