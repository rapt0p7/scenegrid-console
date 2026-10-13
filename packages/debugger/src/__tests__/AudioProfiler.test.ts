import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AudioProfiler } from '../AudioProfiler.js';

describe('AudioProfiler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should track voices from router.soundController Map including stream and virtual voices', () => {
        const mockVoices = new Map<number, any>([
            [
                1,
                {
                    playbackId: 1,
                    soundId: 'backgroundMain',
                    logicalState: 'playing',
                    physicalInstance: { state: 'playing' },
                    isVirtualNode: false
                }
            ],
            [
                2,
                {
                    playbackId: 2,
                    soundId: 'backgroundMain2',
                    logicalState: 'playing',
                    physicalInstance: { state: 'virtual' },
                    isVirtualNode: false
                }
            ],
            [
                3,
                {
                    playbackId: 3,
                    soundId: 'backgroundMain3',
                    logicalState: 'playing',
                    physicalInstance: { state: 'virtual' },
                    isVirtualNode: false
                }
            ]
        ]);

        const mockEngine = {
            _debug: {
                router: {
                    soundController: {
                        activeVoices: mockVoices,
                        getPlaybackState: (id: number) => mockVoices.get(id)?.physicalInstance?.state,
                        getSoundId: (id: number) => mockVoices.get(id)?.soundId,
                        isGhostVoice: () => false
                    }
                }
            }
        };

        const profiler = new AudioProfiler(mockEngine);
        profiler.tick();

        expect(profiler.metrics.voices.hardwareActive).toBe(1);
        expect(profiler.metrics.voices.virtualCulled).toBe(2);
        expect(profiler.metrics.voices.totalTracked).toBe(3);
        expect(profiler.metrics.voices.dump).toEqual([
            { name: 'backgroundMain', isVirtual: false },
            { name: 'backgroundMain2', isVirtual: true },
            { name: 'backgroundMain3', isVirtual: true }
        ]);
    });

    it('should correctly count ghost voices (playVirtual without physical instance) as virtual', () => {
        const mockVoices = new Map<number, any>([
            [
                1,
                {
                    playbackId: 1,
                    soundId: 'scatterer_ghost',
                    logicalState: 'playing',
                    physicalInstance: null,
                    isVirtualNode: true
                }
            ]
        ]);

        const mockEngine = {
            _debug: {
                router: {
                    soundController: {
                        activeVoices: mockVoices,
                        getPlaybackState: () => 'stopped',
                        getSoundId: () => 'scatterer_ghost',
                        isGhostVoice: (id: number) => Boolean(mockVoices.get(id)?.isVirtualNode)
                    }
                }
            }
        };

        const profiler = new AudioProfiler(mockEngine);
        profiler.tick();

        expect(profiler.metrics.voices.hardwareActive).toBe(0);
        expect(profiler.metrics.voices.virtualCulled).toBe(1);
        expect(profiler.metrics.voices.totalTracked).toBe(1);
        expect(profiler.metrics.voices.dump).toEqual([{ name: 'scatterer_ghost', isVirtual: true }]);
    });

    it('should work when soundController provides getActivePlaybacks array', () => {
        const mockEngine = {
            _debug: {
                soundController: {
                    getActivePlaybacks: () => [101, 102],
                    getPlaybackState: (id: number) => (id === 101 ? 'playing' : 'virtual'),
                    getSoundId: (id: number) => `sound_${id}`,
                    isGhostVoice: () => false
                }
            }
        };

        const profiler = new AudioProfiler(mockEngine);
        profiler.tick();

        expect(profiler.metrics.voices.hardwareActive).toBe(1);
        expect(profiler.metrics.voices.virtualCulled).toBe(1);
        expect(profiler.metrics.voices.totalTracked).toBe(2);
        expect(profiler.metrics.voices.dump).toEqual([
            { name: 'sound_101', isVirtual: false },
            { name: 'sound_102', isVirtual: true }
        ]);
    });

    it('should fall back to poolManager.getActiveVoices when soundController is missing', () => {
        const mockEngine = {
            _debug: {
                poolManager: {
                    getActiveVoices: () => [
                        { id: 'poolVoice1', state: 'playing' },
                        { id: 'poolVoice2', state: 'virtual' }
                    ]
                }
            }
        };

        const profiler = new AudioProfiler(mockEngine);
        profiler.tick();

        expect(profiler.metrics.voices.hardwareActive).toBe(1);
        expect(profiler.metrics.voices.virtualCulled).toBe(1);
        expect(profiler.metrics.voices.totalTracked).toBe(2);
        expect(profiler.metrics.voices.dump).toEqual([
            { name: 'poolVoice1', isVirtual: false },
            { name: 'poolVoice2', isVirtual: true }
        ]);
    });

    it('should respect throttleMs on subsequent tick calls', () => {
        const mockEngine = {
            _debug: {
                soundController: {
                    getActivePlaybacks: vi.fn().mockReturnValue([])
                }
            }
        };

        const profiler = new AudioProfiler(mockEngine);
        profiler.tick();
        expect(mockEngine._debug.soundController.getActivePlaybacks).toHaveBeenCalledTimes(1);

        profiler.tick();
        expect(mockEngine._debug.soundController.getActivePlaybacks).toHaveBeenCalledTimes(1);
    });

    it('should update mixer and bus metrics properly', () => {
        const mockEngine = {
            _debug: {
                config: {
                    buses: {
                        master: {},
                        sfx: {}
                    }
                },
                layerStack: {
                    layers: new Map([
                        [
                            'base',
                            {
                                priority: 0,
                                snapshot: { metadata: { snapshotId: 'snap_base' } }
                            }
                        ],
                        [
                            'overlay',
                            {
                                id: 'combat',
                                priority: 1,
                                snapshot: { metadata: { snapshotId: 'snap_combat' } }
                            }
                        ]
                    ])
                },
                busSystem: {
                    getAllBuses: () =>
                        new Map([
                            [
                                'sfx',
                                {
                                    targetParams: { gain: { logical: 1.0, rtpc: 0.8 } },
                                    logicalTargetGain: 0.8
                                }
                            ]
                        ])
                }
            }
        };

        const profiler = new AudioProfiler(mockEngine);
        profiler.tick();

        expect(profiler.metrics.mixer.globalSnapshot).toBe('snap_base');
        expect(profiler.metrics.mixer.activeLayers).toBe('combat (snap_combat)');
        expect(profiler.metrics.buses['sfx']).toBe('Base: 1.00 × RTPC: 0.80 = 0.80');
    });

    it('should handle constructor with missing config or buses safely', () => {
        const profiler1 = new AudioProfiler({});
        expect(profiler1.metrics.buses).toEqual({});

        const profiler2 = new AudioProfiler({ _debug: {} });
        expect(profiler2.metrics.buses).toEqual({});
    });

    it('should resolve soundController from router["#soundController"] or eventOrchestrator', () => {
        const mockVoices = new Map([[1, { playbackId: 1, soundId: 's1', physicalInstance: { state: 'playing' } }]]);
        const mockController = {
            activeVoices: mockVoices,
            getPlaybackState: () => 'playing',
            getSoundId: () => 's1'
        };

        const profiler1 = new AudioProfiler({
            _debug: {
                router: {
                    '#soundController': mockController
                }
            }
        });
        profiler1.tick();
        expect(profiler1.metrics.voices.hardwareActive).toBe(1);

        const profiler2 = new AudioProfiler({
            _debug: {
                eventOrchestrator: {
                    soundController: mockController
                }
            }
        });
        profiler2.tick();
        expect(profiler2.metrics.voices.hardwareActive).toBe(1);
    });

    it('should handle activeVoices Map with missing helpers, stopped state, and fallback naming', () => {
        const mockVoices = new Map<number, any>([
            [
                10,
                {
                    playbackId: 10,
                    physicalInstance: { state: 'stopped' }
                }
            ],
            [
                20,
                {
                    playbackId: 20,
                    physicalInstance: { state: 'playing' }
                }
            ],
            [
                30,
                {
                    playbackId: 30,
                    isVirtualNode: false
                }
            ],
            [40, undefined]
        ]);

        const mockEngine = {
            _debug: {
                soundController: {
                    activeVoices: mockVoices,
                    isGhostVoice: (id: number) => id === 30,
                    getSoundId: () => undefined
                }
            }
        };

        const profiler = new AudioProfiler(mockEngine);
        profiler.tick();

        expect(profiler.metrics.voices.virtualCulled).toBe(1);
        expect(profiler.metrics.voices.hardwareActive).toBe(2);
        expect(profiler.metrics.voices.dump).toEqual([
            { name: '20', isVirtual: false },
            { name: '30', isVirtual: true },
            { name: '40', isVirtual: false }
        ]);
    });

    it('should handle getActivePlaybacks array with missing helpers and stopped voices', () => {
        const mockEngine = {
            _debug: {
                soundController: {
                    getActivePlaybacks: () => [1, 2, 3],
                    getPlaybackState: (id: number) => {
                        if (id === 1) return 'stopped';
                        if (id === 2) return 'virtual';
                        return 'playing';
                    }
                }
            }
        };

        const profiler = new AudioProfiler(mockEngine);
        profiler.tick();

        expect(profiler.metrics.voices.hardwareActive).toBe(1);
        expect(profiler.metrics.voices.virtualCulled).toBe(1);
        expect(profiler.metrics.voices.dump).toEqual([
            { name: '2', isVirtual: true },
            { name: '3', isVirtual: false }
        ]);
    });

    it('should handle getActivePlaybacks when isGhostVoice is true without playbackState', () => {
        const mockEngine = {
            _debug: {
                soundController: {
                    getActivePlaybacks: () => [100],
                    isGhostVoice: () => true,
                    getSoundId: () => 'ghost100'
                }
            }
        };

        const profiler = new AudioProfiler(mockEngine);
        profiler.tick();

        expect(profiler.metrics.voices.virtualCulled).toBe(1);
        expect(profiler.metrics.voices.hardwareActive).toBe(0);
        expect(profiler.metrics.voices.dump).toEqual([{ name: 'ghost100', isVirtual: true }]);
    });

    it('should handle soundController with empty object and poolManager with missing methods', () => {
        const profiler1 = new AudioProfiler({
            _debug: {
                soundController: {}
            }
        });
        profiler1.tick();
        expect(profiler1.metrics.voices.totalTracked).toBe(0);

        const profiler2 = new AudioProfiler({
            _debug: {
                poolManager: {
                    getActiveVoices: null
                }
            }
        });
        profiler2.tick();
        expect(profiler2.metrics.voices.totalTracked).toBe(0);

        const profiler3 = new AudioProfiler({
            _debug: {}
        });
        profiler3.tick();
        expect(profiler3.metrics.voices.totalTracked).toBe(0);
    });

    it('should handle mixer metrics edge cases: missing stack, missing base, no overlays, and overlays without snapshot', () => {
        const profilerNoStack = new AudioProfiler({ _debug: {} });
        profilerNoStack.tick();
        expect(profilerNoStack.metrics.mixer.globalSnapshot).toBe('None');

        const profilerNoLayers = new AudioProfiler({ _debug: { layerStack: {} } });
        profilerNoLayers.tick();
        expect(profilerNoLayers.metrics.mixer.globalSnapshot).toBe('None');

        const profilerOnlyOverlays = new AudioProfiler({
            _debug: {
                layerStack: {
                    layers: new Map([['combat', { id: 'combat', priority: 1 }]])
                }
            }
        });
        profilerOnlyOverlays.tick();
        expect(profilerOnlyOverlays.metrics.mixer.globalSnapshot).toBe('[No Base Snapshot]');
        expect(profilerOnlyOverlays.metrics.mixer.activeLayers).toBe('combat');

        const profilerOnlyBase = new AudioProfiler({
            _debug: {
                layerStack: {
                    layers: new Map([['base', { priority: 0 }]])
                }
            }
        });
        profilerOnlyBase.tick();
        expect(profilerOnlyBase.metrics.mixer.globalSnapshot).toBe('[No Base Snapshot]');
        expect(profilerOnlyBase.metrics.mixer.activeLayers).toBe('[No Overlays]');
    });

    it('should handle bus metrics with missing busSystem or missing targetParams (line 194)', () => {
        const profilerNoBus = new AudioProfiler({ _debug: {} });
        profilerNoBus.tick();
        expect(profilerNoBus.metrics.buses).toEqual({});

        const profilerFallbackGain = new AudioProfiler({
            _debug: {
                busSystem: {
                    getAllBuses: () =>
                        new Map([
                            ['busWithLogical', { logicalTargetGain: 0.5 }],
                            ['busWithoutLogical', {}],
                            ['busWithoutGainNode', { targetParams: {} }]
                        ])
                }
            }
        });
        profilerFallbackGain.tick();
        expect(profilerFallbackGain.metrics.buses['busWithLogical']).toBe('Final: 0.50');
        expect(profilerFallbackGain.metrics.buses['busWithoutLogical']).toBe('Final: 0.00');
        expect(profilerFallbackGain.metrics.buses['busWithoutGainNode']).toBe('Final: 0.00');
    });
});
