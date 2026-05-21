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
        spawnRateMs: [1000, 2000],
        maxPolyphony: 5
    }
};
