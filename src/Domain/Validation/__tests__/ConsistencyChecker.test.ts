/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ConsistencyChecker from '@domain/Validation/ConsistencyChecker.js';

import type { BusId, SoundId } from '@shared/Types/Branded.js';
import type { IConsistencyCheckerPayload } from '@domain/Validation/ConsistencyChecker.js';

describe('ConsistencyChecker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
        vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should pass with a perfectly valid config and log OK', () => {
        const validConfig: IConsistencyCheckerPayload = {
            manifest: { ['shoot' as SoundId]: { url: 'sfx/shoot.mp3' } },
            buses: {
                master: { gain: 1 },
                sfx: { gain: 0.8, sends: { ['master' as BusId]: 1 } }
            },
            soundMap: {
                ['gun_fire' as SoundId]: { busId: 'sfx' as BusId, src: 'shoot' }
            },
            snapshots: {}
        };

        expect(ConsistencyChecker.validate(validConfig)).toBe(true);
    });

    it('should fail if config is missing or not an object', () => {
        expect(ConsistencyChecker.validate(null as any)).toBe(false);
    });

    describe('Deep Type Assertions (assertType & assertArray)', () => {
        it('should catch array vs object mismatches', () => {
            const config: any = {
                buses: { master: [] },
                soundMap: { bad: { isLayered: true, layers: {} } }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
        });
    });

    describe('Routing Cycle Validations (DFS)', () => {
        it('should log a fatal error when an indirect feedback loop is detected (A -> B -> C -> A)', () => {
            const config: any = {
                buses: {
                    bus_A: { gain: 1, sends: { bus_B: 1 } },
                    bus_B: { gain: 1, sends: { bus_C: 1 } },
                    bus_C: { gain: 1, sends: { bus_A: 1 } }
                },
                soundMap: {},
                manifest: {},
                snapshots: {}
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Fatal Error: Audio routing loop detected in configuration: bus_A -> bus_B -> bus_C -> bus_A'
                )
            );
        });

        it('should pass successfully for complex but acyclic routing (Diamond Pattern)', () => {
            const config: any = {
                buses: {
                    bus_A: { gain: 1, sends: { bus_B: 1, bus_C: 1 } },
                    bus_B: { gain: 1, sends: { bus_D: 1 } },
                    bus_C: { gain: 1, sends: { bus_D: 1 } },
                    bus_D: { gain: 1 }
                },
                soundMap: {},
                manifest: {},
                snapshots: {}
            };

            expect(ConsistencyChecker.validate(config)).toBe(true);
        });
    });

    describe('Bus Validations (Filters, Sends)', () => {
        it('should fail if no buses are defined', () => {
            expect(ConsistencyChecker.validate({ buses: {}, manifest: {}, soundMap: {}, snapshots: {} } as any)).toBe(
                false
            );
        });

        it('should catch feedback loops and unknown send targets', () => {
            const config: any = {
                buses: {
                    master: { sends: { master: 1 } },
                    sfx: { sends: { ghost_bus: 1 } }
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should validate bus filters (valid, invalid object, invalid type)', () => {
            const config: any = {
                buses: {
                    master: { filter: { type: 'lowpass' } }, // OK
                    bad1: { filter: 'not an object' }, // Fail object check
                    bad2: { filter: { type: 123 } } // Fail string check
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
        });
    });

    describe('Sidechain Validations', () => {
        it('should validate sidechain property on bus config', () => {
            const config: any = {
                buses: {
                    master: { gain: 1, sidechain: { enabled: true } }, // OK
                    bad1: { gain: 1, sidechain: 'not an object' }, // Fail
                    bad2: { gain: 1, sidechain: { enabled: 'yes' } } // Fail
                },
                soundMap: {}
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Type Error at "buses.bad1.sidechain"'));
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "buses.bad2.sidechain.enabled": expected boolean')
            );
        });

        it('should fail if sound targets a bus for ducking that has no sidechain enabled', () => {
            const config: any = {
                buses: {
                    master: { gain: 1 },
                    sfx: { gain: 1, sidechain: { enabled: false } },
                    music: { gain: 1, sidechain: { enabled: true } }
                },
                soundMap: {
                    sound1: { busId: 'sfx', ducking: { target: 'master' } },
                    sound2: { busId: 'sfx', ducking: { target: 'sfx' } },
                    sound3: { busId: 'sfx', ducking: { target: 'music' } }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('targets bus "master" for ducking, but sidechain is not enabled')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('targets bus "sfx" for ducking, but sidechain is not enabled')
            );
        });
    });

    describe('SoundMap, Ducking & Spatial Validations', () => {
        it('should fail if sound references unknown bus or lacks busId', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    boom: { busId: 'unknown', src: 'b' },
                    orphan: { src: 'b' }
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should validate ducking targets (unknown bus)', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: { s1: { busId: 'master', ducking: { target: ['unknown_bus'] } } }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should validate spatial position arrays strictly requiring 3 numbers', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    '3d_good': { busId: 'master', spatial: { position: [1, 2, 3] } },
                    '3d_bad_type': { busId: 'master', spatial: { position: [1, 'two', 3] } }, // Fail inside if
                    '3d_bad_len': { busId: 'master', spatial: { position: [1, 2] } } // Fail length check
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should catch non-string ducking targets safely', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    s1: { busId: 'master', ducking: { target: 123 } },
                    s2: { busId: 'master', ducking: { target: ['master', null] } }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('has non-string ducking target'));
        });

        it('should catch invalid spatial distance models', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    s1: {
                        busId: 'master',
                        spatial: {
                            distanceModel: 'magic_model'
                        }
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('has invalid distanceModel: "magic_model"')
            );
        });
    });

    describe('RTPC Deep Validations', () => {
        it('should catch RTPC curves with less than 2 points', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    s1: {
                        busId: 'master',
                        rtpc: {
                            volume: { gameParam: 'hp', curve: [{ x: 0, y: 0 }] }
                        }
                    }
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should catch invalid curves, missing gameParams, and sendLevel issues', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    s1: {
                        busId: 'master',
                        rtpc: {
                            pitch: {
                                gameParam: 123,
                                curve: [
                                    { x: 0, y: 0 },
                                    { x: 1, y: 1 }
                                ]
                            },
                            sendLevel: {
                                gameParam: 'hp',
                                curve: [
                                    { x: 0, y: 0 },
                                    { x: 1, y: 1 }
                                ]
                            }
                        }
                    }
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should catch RTPC sendLevel targeting an unknown bus', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    s1: {
                        busId: 'master',
                        rtpc: {
                            sendLevel: {
                                gameParam: 'hp',
                                sendTargetBus: 'ghost_bus',
                                curve: [
                                    { x: 0, y: 0 },
                                    { x: 1, y: 1 }
                                ]
                            }
                        }
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('references unknown bus "ghost_bus"'));
        });
    });

    describe('SmartLoop & Container Validations', () => {
        it('should catch invalid SmartLoop regions', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    loop1: { smartLoop: { regions: { intro: [10, 5] } } }
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should catch layered sounds with missing audio references', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    l1: { isLayered: true, layers: [{ src: 'missing_file', delayMs: 0, volume: 1 }] }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Layered sound "l1" references missing audio "missing_file"')
            );
        });

        it('should catch empty containers and containers with missing sources', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    empty_cont: { isContainer: true, mode: 'random', sources: [] },
                    bad_cont: { isContainer: true, mode: 'random', sources: ['missing_source'] }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Container "empty_cont" has an empty sources array.')
            );
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Container "bad_cont" references missing source "missing_source".')
            );
        });

        it('should catch SmartLoop regions with invalid lengths or non-number values', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    loop1: { smartLoop: { regions: { intro: [10] } } },
                    loop2: { smartLoop: { regions: { outro: ['10', 20] } } }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('must be an array of two numbers'));
        });

        it('should accept container sources as strings or objects with weights', () => {
            const config: any = {
                buses: { master: { gain: 1 } },
                manifest: { s1: { url: '1' }, s2: { url: '2' } },
                soundMap: {
                    cont: {
                        isContainer: true,
                        mode: 'random',
                        sources: ['s1', { id: 's2', weight: 4 }]
                    }
                }
            };
            const result = ConsistencyChecker.validate(config);
            expect(result).toBe(true);
        });

        it('should catch invalid object sources in containers (missing id or bad weight type)', () => {
            const config: any = {
                buses: { master: { gain: 1 } },
                manifest: { s1: { url: '1' }, s2: { url: '2' } },
                soundMap: {
                    cont: {
                        isContainer: true,
                        mode: 'random',
                        sources: [{ weight: 2 }, { id: 's2', weight: 'heavy' }]
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "soundMap.cont.sources[0].id"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "soundMap.cont.sources[1].weight": expected number')
            );
        });

        it('should catch containers with undefined sources in the array', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    bad_cont: { isContainer: true, mode: 'random', sources: [undefined] }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Container "bad_cont" has an undefined source at index 0.')
            );
        });
    });

    describe('Snapshot Validations', () => {
        it('should catch unknown buses and validate filters inside snapshots', () => {
            const config: any = {
                buses: { master: {} },
                snapshots: {
                    snap1: {
                        buses: {
                            ghost_bus: { gain: 1 },
                            master: { filter: { type: 'lowpass' } },
                            master_bad: { filter: { type: 123 } }
                        }
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Snapshot "snap1" refers to unknown bus "ghost_bus"')
            );
        });
        it('should catch snapshot sends to unknown buses', () => {
            const config: any = {
                buses: { master: {} },
                snapshots: {
                    snap1: {
                        buses: {
                            master: { sends: { ghost_bus: 0.5 } }
                        }
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('sends to unknown bus "ghost_bus"'));
        });
    });

    describe('Orphan Manifest Sounds & Reporting', () => {
        it('should NOT warn about orphan sounds if the soundMap key directly matches the manifest key (without src)', () => {
            const config: any = {
                buses: { master: {} },
                manifest: {
                    direct_match_key: { url: 'audio.mp3' }
                },
                soundMap: {
                    direct_match_key: { busId: 'master' }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('Manifest sound "direct_match_key" is not referenced')
            );
        });

        it('should warn about true orphan sounds', () => {
            const config: any = {
                buses: { master: {} },
                manifest: { orphan: { url: '4' } },
                soundMap: {}
            };

            ConsistencyChecker.validate(config);
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Manifest sound "orphan" is not referenced')
            );
        });
    });

    describe('RTPC Config Validation (Curves & Presets)', () => {
        it('should pass validation for a valid preset curve and new slew rates', () => {
            const config: any = {
                buses: { main: { gain: 1 } },
                soundMap: {
                    sound1: {
                        busId: 'main',
                        rtpc: {
                            gain: {
                                gameParam: 'speed',
                                attackMs: 100,
                                releaseMs: 500,
                                curve: {
                                    type: 's-curve',
                                    minX: 0,
                                    maxX: 100,
                                    minY: 0,
                                    maxY: 1
                                }
                            }
                        }
                    }
                }
            };

            const checker = new ConsistencyChecker({
                soundMapConfig: config.soundMap,
                soundManifest: {},
                busSystemConfig: config.buses,
                snapshotsConfig: {},
                rtpcManifest: {}
            });

            (checker as any).run();
            expect((checker as any).errors).toHaveLength(0);
        });

        it('should generate errors for missing preset fields', () => {
            const config: any = {
                buses: { main: { gain: 1 } },
                soundMap: {
                    sound1: {
                        busId: 'main',
                        rtpc: {
                            gain: {
                                gameParam: 'speed',
                                curve: {
                                    type: 's-curve',
                                    minX: 0
                                }
                            }
                        }
                    }
                }
            };

            const checker = new ConsistencyChecker({
                soundMapConfig: config.soundMap,
                soundManifest: {},
                busSystemConfig: config.buses,
                snapshotsConfig: {},
                rtpcManifest: {}
            });

            (checker as any).run();
            const errors = (checker as any).errors;
            expect(errors.length).toBeGreaterThan(0);
            expect(
                errors.some((error: string) =>
                    error.includes('Missing required field at "soundMap.sound1.rtpc.gain.curve.maxX"')
                )
            ).toBe(true);
        });

        it('should generate an error for an unknown preset type', () => {
            const config: any = {
                buses: { main: { gain: 1 } },
                soundMap: {
                    sound1: {
                        busId: 'main',
                        rtpc: {
                            gain: {
                                gameParam: 'speed',
                                curve: {
                                    type: 'magic-curve',
                                    minX: 0,
                                    maxX: 10,
                                    minY: 0,
                                    maxY: 1
                                }
                            }
                        }
                    }
                }
            };

            const checker = new ConsistencyChecker({
                soundMapConfig: config.soundMap,
                soundManifest: {},
                busSystemConfig: config.buses,
                snapshotsConfig: {},
                rtpcManifest: {}
            });

            (checker as any).run();
            expect((checker as any).errors.some((error: string) => error.includes('invalid type "magic-curve"'))).toBe(
                true
            );
        });
    });

    describe('Switch Validations', () => {
        it('should pass a perfectly valid switch config', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: { surface: { defaultValue: 0 } },
                soundMap: {
                    wood: { busId: 'sfx' },
                    stone: { busId: 'sfx' },
                    def: { busId: 'sfx' },
                    footstep: {
                        isSwitch: true,
                        busId: 'sfx',
                        switchGroup: 'surface',
                        switches: { 0: 'wood', 1: 'stone' },
                        defaultSwitch: 'def'
                    }
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(true);
        });

        it('should fail if switchGroup references an unknown RTPC parameter', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: { health: { defaultValue: 100 } },
                soundMap: {
                    bad_switch: {
                        isSwitch: true,
                        busId: 'sfx',
                        switchGroup: 'ghost_param',
                        switches: {}
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Switch "bad_switch" uses unknown switchGroup (RTPC param) "ghost_param".')
            );
        });

        it('should catch invalid switch structures (missing group, bad switches type)', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: { surface: {} },
                soundMap: {
                    bad_switch1: { isSwitch: true, busId: 'sfx', switchGroup: 'surface', switches: [] },
                    bad_switch2: { isSwitch: true, busId: 'sfx', switchGroup: 123, switches: {} }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "soundMap.bad_switch1.switches": expected an object.')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "soundMap.bad_switch2.switchGroup"')
            );
        });

        it('should warn if a switch maps to a non-existent soundId', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: { surface: {} },
                soundMap: {
                    my_switch: {
                        isSwitch: true,
                        busId: 'sfx',
                        switchGroup: 'surface',
                        switches: { 0: 'missing_sound' }
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Switch "my_switch" references missing source "missing_sound".')
            );
        });

        it('should warn if defaultSwitch points to a missing soundId', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: { surface: {} },
                soundMap: {
                    my_switch: {
                        isSwitch: true,
                        busId: 'sfx',
                        switchGroup: 'surface',
                        switches: {},
                        defaultSwitch: 'missing_default'
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Switch "my_switch" references missing defaultSwitch "missing_default".')
            );
        });

        it('should warn if a switch has no mappings and no defaultSwitch', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: { surface: {} },
                soundMap: {
                    useless_switch: {
                        isSwitch: true,
                        busId: 'sfx',
                        switchGroup: 'surface',
                        switches: {}
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Switch "useless_switch" has empty switches and no defaultSwitch.')
            );
        });
    });

    describe('100% Coverage Edge Cases', () => {
        it('should handle absent base properties in early returns (checkRoutingCycles, etc.)', () => {
            const checker = new (ConsistencyChecker as any)({
                soundMapConfig: null,
                soundManifest: null,
                busSystemConfig: null,
                snapshotsConfig: null,
                rtpcManifest: null
            });
            expect(() => checker['run']()).not.toThrow();
            expect(checker['errors'].length).toBeGreaterThan(0);
        });

        it('should fail if missing required array (Container sources)', () => {
            const config: any = {
                buses: { master: { gain: 1 } },
                soundMap: {
                    bad_cont: { isContainer: true, mode: 'random' }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing required array at "soundMap.bad_cont.sources"')
            );
        });

        it('should catch invalid objects in soundMap, smartLoop, ducking, and spatial', () => {
            const config: any = {
                buses: { master: { gain: 1 } },
                soundMap: {
                    s1: 'not an object',
                    s2: { smartLoop: 'not an object' },
                    s3: { smartLoop: { regions: 'not an object' } },
                    s4: { busId: 'master', ducking: 'not an object' },
                    s5: { busId: 'master', spatial: 'not an object' }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Type Error at "soundMap.s1"'));
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "soundMap.s2.smartLoop"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "soundMap.s3.smartLoop.regions"')
            );
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Type Error at "soundMap.s4.ducking"'));
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Type Error at "soundMap.s5.spatial"'));
        });

        it('should catch invalid objects in snapshots', () => {
            const config: any = {
                buses: { master: { gain: 1 } },
                snapshots: {
                    snap1: 'not an object',
                    snap2: { buses: 'not an object' },
                    snap3: { buses: { master: 'not an object' } },
                    snap4: {}
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Type Error at "snapshots.snap1"'));
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "snapshots.snap2.buses"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "snapshots.snap3.buses.master"')
            );
        });

        it('should trigger Ghost Ducking warnings', () => {
            const config: any = {
                buses: {
                    master: { gain: 1, sidechain: { enabled: true } },
                    sfx: { gain: 0 }
                },
                soundMap: {
                    hit: { busId: 'sfx', ducking: { target: 'master' } }
                },
                snapshots: {
                    snap1: { buses: {} },
                    snap2: { buses: { sfx: { gain: 0 } } }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Ghost Ducking Risk: Sound "hit"'));
            expect(console.warn).toHaveBeenCalledTimes(2);
        });

        it('should trigger Multiplicative Vetoes rules (Base Gain < 1 & Snapshot Overrides)', () => {
            const config: any = {
                buses: {
                    master: {
                        gain: 0.5,
                        rtpc: {
                            gain: {
                                gameParam: 'tension',
                                curve: [
                                    { x: 0, y: 0 },
                                    { x: 1, y: 1 }
                                ]
                            }
                        }
                    }
                },
                snapshots: {
                    snap1: {},
                    snap2: { buses: { master: { gain: 0 } } },
                    snap3: { buses: { master: { gain: 0.8 } } }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining(
                    '[Orchestration Rule] Bus "master" is RTPC-driven for gain, but its base gain is 0.5.'
                )
            );
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Multiplicative Veto] Snapshot "snap2" explicitly MUTES gain')
            );
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Multiplicative Veto] Snapshot "snap3" explicitly SCALES gain')
            );
        });

        it('should catch deep RTPC type errors', () => {
            const config: any = {
                buses: {
                    master: {
                        rtpc: {
                            gain: null,
                            pitch: {
                                gameParam: 'tension',
                                smoothingMs: 'not a number',
                                curve: null
                            },
                            pan: {
                                gameParam: 'tension',
                                curve: 123
                            },
                            filterFrequency: {
                                gameParam: 'tension',
                                sendTargetBus: 'master',
                                curve: [
                                    { x: 0, y: 0 },
                                    { x: 1, y: 1 }
                                ]
                            }
                        }
                    },
                    sfx: { rtpc: 'not an object' }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Type Error at "buses.sfx.rtpc"'));
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "buses.master.rtpc.pitch.smoothingMs"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "buses.master.rtpc.pitch.curve"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "buses.master.rtpc.pan.curve"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("specifies 'sendTargetBus', but target property is not 'sendLevel'")
            );
        });

        it('should catch RTPCManifest type errors', () => {
            const config: any = {
                buses: { master: { gain: 1 } },
                rtpcManifest: {
                    param1: 'not an object',
                    param2: {
                        attackMs: 'str',
                        releaseMs: 'str',
                        defaultValue: 'str'
                    }
                } as any
            };

            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Type Error at "rtpcManifest.param1"'));
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "rtpcManifest.param2.attackMs"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "rtpcManifest.param2.releaseMs"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "rtpcManifest.param2.defaultValue"')
            );

            const configInvalidManifest: any = {
                buses: { master: { gain: 1 } },
                rtpcManifest: 'not an object'
            };
            ConsistencyChecker.validate(configInvalidManifest);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Type Error at "rtpcManifest"'));
        });

        it('should catch unknown send targets in base bus config (checkBuses)', () => {
            const config: any = {
                buses: {
                    sfx: { gain: 1, sends: { ghost_bus: 1 } }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Bus "sfx" sends to unknown bus "ghost_bus"')
            );
        });

        it('should catch RTPC curves with less than 2 points', () => {
            const config: any = {
                buses: { master: { gain: 1 } },
                soundMap: {
                    s1: {
                        busId: 'master',
                        rtpc: {
                            gain: { gameParam: 'hp', curve: [{ x: 0, y: 0 }] }
                        }
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('has invalid curve (needs >= 2 points)')
            );
        });
    });
});
