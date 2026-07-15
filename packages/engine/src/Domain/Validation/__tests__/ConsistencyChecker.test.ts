/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ConsistencyChecker from '@domain/Validation/ConsistencyChecker.js';
import { ConsoleReporter } from '@domain/Validation/Reporters/ConsoleReporter.js';

import type { BusId, SoundId } from '@scene-grid/shared';
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
                    master: { filter: { type: 'lowpass' } },
                    bad1: { filter: 'not an object' },
                    bad2: { filter: { type: 123 } }
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
        });
    });

    describe('Sidechain Validations', () => {
        it('should validate sidechain property on bus config', () => {
            const config: any = {
                buses: {
                    master: { gain: 1, sidechain: { enabled: true } },
                    bad1: { gain: 1, sidechain: 'not an object' },
                    bad2: { gain: 1, sidechain: { enabled: 'yes' } }
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
                    '3d_bad_type': { busId: 'master', spatial: { position: [1, 'two', 3] } },
                    '3d_bad_len': { busId: 'master', spatial: { position: [1, 2] } }
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
        it('should catch invalid SmartLoop regions (start >= end)', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    loop1: { busId: 'master', smartLoop: { regions: { intro: [10, 5] } } }
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(false);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('has invalid range (10 >= 5)'));
        });

        it('should catch SmartLoop regions with invalid lengths or non-number values', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    loop_short: { busId: 'master', smartLoop: { regions: { intro: [10] } } },
                    loop_long: { busId: 'master', smartLoop: { regions: { intro: [10, 20, 300, 400, 500] } } },
                    loop_str: { busId: 'master', smartLoop: { regions: { outro: ['10', 20] } } },
                    loop_pre_str: { busId: 'master', smartLoop: { regions: { outro: [10, 20, '500'] } } },
                    loop_tail_str: { busId: 'master', smartLoop: { regions: { outro: [10, 20, 500, '1000'] } } }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('SmartLoop "loop_short" region "intro" must be an array of 2 to 4 numbers.')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('SmartLoop "loop_long" region "intro" must be an array of 2 to 4 numbers.')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('SmartLoop "loop_str" region "outro" must be an array of 2 to 4 numbers.')
            );

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('SmartLoop "loop_pre_str" region "outro" preEntryMs must be a number.')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('SmartLoop "loop_tail_str" region "outro" tailMs must be a number.')
            );
        });

        it('should pass valid SmartLoop regions with or without preEntryMs and tailMs', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    loop_base: { busId: 'master', smartLoop: { regions: { intro: [10, 20] } } },
                    loop_pickup: { busId: 'master', smartLoop: { regions: { intro: [10, 20, 500] } } },
                    loop_tail: { busId: 'master', smartLoop: { regions: { intro: [10, 20, 500, 1500] } } }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(true);
            expect(console.error).not.toHaveBeenCalled();
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
                expect.stringContaining('"soundMap.empty_cont.sources" cannot be empty.')
            );
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Source item at "soundMap.bad_cont.sources[0]" references missing sound "missing_source".'
                )
            );
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
                expect.stringContaining('Source item at "soundMap.bad_cont.sources[0]" is undefined or null.')
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

            const checker = new ConsistencyChecker(
                {
                    soundMapConfig: config.soundMap,
                    soundManifest: {},
                    busSystemConfig: config.buses,
                    snapshotsConfig: {},
                    rtpcManifest: {},
                    eventsConfig: {},
                    banksConfig: {}
                },
                [new ConsoleReporter()]
            );

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

            const checker = new ConsistencyChecker(
                {
                    soundMapConfig: config.soundMap,
                    soundManifest: {},
                    busSystemConfig: config.buses,
                    snapshotsConfig: {},
                    rtpcManifest: {},
                    eventsConfig: {},
                    banksConfig: {}
                },
                [new ConsoleReporter()]
            );

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

            const checker = new ConsistencyChecker(
                {
                    soundMapConfig: config.soundMap,
                    soundManifest: {},
                    busSystemConfig: config.buses,
                    snapshotsConfig: {},
                    rtpcManifest: {},
                    eventsConfig: {},
                    banksConfig: {}
                },
                [new ConsoleReporter()]
            );

            (checker as any).run();
            expect((checker as any).errors.some((error: string) => error.includes('invalid type "magic-curve"'))).toBe(
                true
            );
        });
    });

    describe('Switch Validations', () => {
        it('should pass a perfectly valid switch config (with and without hysteresis)', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: { surface: { defaultValue: 0 }, speed: { defaultValue: 0 } },
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
                    },
                    footstep_with_hysteresis: {
                        isSwitch: true,
                        busId: 'sfx',
                        switchGroup: 'speed',
                        hysteresis: 15,
                        switches: { 0: 'wood', 50: 'stone' },
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

        it('should catch negative hysteresis in switch containers', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: { speed: { defaultValue: 0 } },
                soundMap: {
                    bad_switch: {
                        isSwitch: true,
                        busId: 'sfx',
                        switchGroup: 'speed',
                        hysteresis: -5,
                        switches: {}
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Switch "bad_switch" hysteresis cannot be negative.')
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
            const checker = new (ConsistencyChecker as any)(
                {
                    soundMapConfig: null,
                    soundManifest: null,
                    busSystemConfig: null,
                    snapshotsConfig: null,
                    rtpcManifest: null
                },
                [new ConsoleReporter()]
            );
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
                },
                banks: {
                    Bank_A: { sounds: ['hit'] }
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

    describe('ConsistencyChecker: Event Map Validations', () => {
        let consoleErrorSpy: any;
        let consoleWarnSpy: any;
        // oxlint-disable-next-line no-unused-vars
        let consoleLogSpy: any;
        // oxlint-disable-next-line no-unused-vars
        let consoleGroupSpy: any;
        // oxlint-disable-next-line no-unused-vars
        let consoleGroupEndSpy: any;

        // oxlint-disable-next-line unicorn/consistent-function-scoping
        const getBaseConfig = () => ({
            buses: { master: {} },
            soundMap: { sfx_test: { busId: 'master' }, bgm_test: { busId: 'master' } },
            manifest: { sfx_test: { url: 'sfx.wav' } },
            snapshots: {},
            rtpcManifest: { player_health: { defaultValue: 100 } }
        });

        beforeEach(() => {
            vi.clearAllMocks();
            consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            consoleGroupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
            consoleGroupEndSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should pass a perfectly valid event map config', () => {
            const config: any = {
                ...getBaseConfig(),
                events: {
                    Valid_Event: {
                        actions: [
                            { type: 'play', target: 'sfx_test' },
                            { type: 'stop', target: 'bgm_test', options: { allowTail: true, fadeOutMs: 500 } },
                            { type: 'pause', target: 'sfx_test' },
                            { type: 'resume', target: 'sfx_test' },
                            { type: 'set_rtpc', param: 'player_health', value: 50 }
                        ]
                    }
                }
            };

            const isValid = ConsistencyChecker.validate(config);

            expect(isValid).toBe(true);
            expect(consoleErrorSpy).not.toHaveBeenCalled();
        });

        it('should fail if "events" is not an object', () => {
            const config: any = { ...getBaseConfig(), events: [] };
            ConsistencyChecker.validate(config);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Type Error at "events"'));
        });

        it('should fail if an individual event config is not an object', () => {
            const config: any = {
                ...getBaseConfig(),
                events: {
                    Bad_Event: 'this should be an object'
                }
            };
            ConsistencyChecker.validate(config);
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Type Error at "events.Bad_Event"'));
        });

        it('should fail if "actions" is missing or not an array', () => {
            const config: any = {
                ...getBaseConfig(),
                events: {
                    No_Actions: {},
                    Bad_Actions: { actions: { type: 'play', target: 'sfx' } }
                }
            };
            ConsistencyChecker.validate(config);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Missing required array at "events.No_Actions.actions"')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "events.Bad_Actions.actions"')
            );
        });

        it('should fail if an action is not an object or lacks a string "type"', () => {
            const config: any = {
                ...getBaseConfig(),
                events: {
                    Bad_Event: {
                        actions: [null, { target: 'sfx' }, { type: 123, target: 'sfx' }]
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "events.Bad_Event.actions[0]"')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "events.Bad_Event.actions[1].type"')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "events.Bad_Event.actions[2].type"')
            );
        });

        it('should fail on unknown action types', () => {
            const config: any = {
                ...getBaseConfig(),
                events: {
                    Bad_Event: {
                        actions: [{ type: 'do_barrel_roll', target: 'sfx_test' }]
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Unknown action type "do_barrel_roll" at events.Bad_Event.actions[0]')
            );
        });

        describe('Action-specific Validations', () => {
            it('should catch missing or invalid targets for play, pause, and resume', () => {
                const config: any = {
                    ...getBaseConfig(),
                    events: {
                        Bad_Event: {
                            actions: [{ type: 'play' }, { type: 'pause', target: 42 }, { type: 'resume', target: [] }]
                        }
                    }
                };
                ConsistencyChecker.validate(config);
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Missing required field at "events.Bad_Event.actions[0].target"')
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Type Error at "events.Bad_Event.actions[1].target": expected string')
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Type Error at "events.Bad_Event.actions[2].target": expected string')
                );
            });

            it('should catch missing or invalid target and options in stop action', () => {
                const config: any = {
                    ...getBaseConfig(),
                    events: {
                        Bad_Event: {
                            actions: [
                                { type: 'stop' },
                                { type: 'stop', target: 'bgm_test', options: 'fast' },
                                { type: 'stop', target: 'bgm_test', options: { allowTail: 'yes' } },
                                { type: 'stop', target: 'bgm_test', options: { fadeOutMs: '1s' } }
                            ]
                        }
                    }
                };
                ConsistencyChecker.validate(config);
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Missing required field at "events.Bad_Event.actions[0].target"')
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Type Error at "events.Bad_Event.actions[1].options": expected object')
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'Type Error at "events.Bad_Event.actions[2].options.allowTail": expected boolean'
                    )
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'Type Error at "events.Bad_Event.actions[3].options.fadeOutMs": expected number'
                    )
                );
            });

            it('should catch missing or invalid fields in set_rtpc action', () => {
                const config: any = {
                    ...getBaseConfig(),
                    events: {
                        Bad_Event: {
                            actions: [
                                { type: 'set_rtpc', value: 50 },
                                { type: 'set_rtpc', param: 123, value: 50 },
                                { type: 'set_rtpc', param: 'player_health' },
                                { type: 'set_rtpc', param: 'player_health', value: '50' }
                            ]
                        }
                    }
                };
                ConsistencyChecker.validate(config);
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Missing required field at "events.Bad_Event.actions[0].param"')
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Type Error at "events.Bad_Event.actions[1].param": expected string')
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Missing required field at "events.Bad_Event.actions[2].value"')
                );
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Type Error at "events.Bad_Event.actions[3].value": expected number')
                );
            });
        });

        describe('Cross-referential Validations (Warnings & Errors)', () => {
            it('should issue a WARNING if a play/stop/pause/resume target does not exist in soundMap or manifest', () => {
                const config: any = {
                    ...getBaseConfig(),
                    events: {
                        Warning_Event: {
                            actions: [{ type: 'play', target: 'ghost_sound' }]
                        }
                    }
                };
                ConsistencyChecker.validate(config);
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'Event "Warning_Event" references missing sound target "ghost_sound" at events.Warning_Event.actions[0]'
                    )
                );
            });

            it('should issue an ERROR if set_rtpc param does not exist in rtpcManifest', () => {
                const config: any = {
                    ...getBaseConfig(),
                    events: {
                        Error_Event: {
                            actions: [{ type: 'set_rtpc', param: 'ghost_parameter', value: 10 }]
                        }
                    }
                };
                ConsistencyChecker.validate(config);
                expect(consoleErrorSpy).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'Event "Error_Event" uses unknown RTPC param "ghost_parameter" at events.Error_Event.actions[0]'
                    )
                );
            });

            it('should NOT issue an ERROR for missing RTPC param if rtpcManifest is empty/not provided', () => {
                const config: any = {
                    ...getBaseConfig(),
                    rtpcManifest: {},
                    events: {
                        Ok_Event: {
                            actions: [{ type: 'set_rtpc', param: 'any_parameter', value: 10 }]
                        }
                    }
                };
                const isValid = ConsistencyChecker.validate(config);
                expect(isValid).toBe(true);
                expect(consoleErrorSpy).not.toHaveBeenCalled();
            });
        });
    });

    describe('SmartLoop Magnets Validations', () => {
        let consoleErrorSpy: any;
        beforeEach(() => {
            vi.clearAllMocks();
            consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });
        it('should pass a perfectly valid SmartLoop config with magnets', () => {
            const config: any = {
                buses: { master: {} },
                events: {},
                rtpcManifest: { boss_phase: { defaultValue: 1 } },
                soundMap: {
                    bgm_boss: {
                        busId: 'master',
                        url: 'dummy/path.mp3',
                        volume: 1,
                        smartLoop: {
                            regions: { intro: [0, 100], phase2: [100, 200] },
                            magnets: [
                                {
                                    region: 'intro',
                                    targetRegion: 'phase2',
                                    quantize: 'NextBar',
                                    tailDurationMs: 1500,
                                    condition: { param: 'boss_phase', operator: '==', value: 2 }
                                }
                            ]
                        }
                    }
                }
            };

            const errorSpy = vi.spyOn(console, 'error');
            const isValid = ConsistencyChecker.validate(config);

            expect(isValid).toBe(true);
            expect(errorSpy).not.toHaveBeenCalled();

            errorSpy.mockRestore();
        });

        it('should fail if magnets property is not an array or contains non-objects', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    bad_magnets_1: {
                        busId: 'master',
                        smartLoop: { regions: { intro: [0, 100] }, magnets: 'should be an array' }
                    },
                    bad_magnets_2: {
                        busId: 'master',
                        smartLoop: { regions: { intro: [0, 100] }, magnets: ['should be an object'] }
                    }
                }
            };

            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "soundMap.bad_magnets_1.smartLoop.magnets": expected array')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Type Error at "soundMap.bad_magnets_2.smartLoop.magnets[0]": expected object')
            );
        });

        it('should catch missing required fields in magnet config (region, targetRegion, quantize, condition)', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    bad_magnet: {
                        busId: 'master',
                        smartLoop: {
                            regions: { intro: [0, 100] },
                            magnets: [{}]
                        }
                    }
                }
            };

            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "soundMap.bad_magnet.smartLoop.magnets[0].region"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Missing required field at "soundMap.bad_magnet.smartLoop.magnets[0].targetRegion"'
                )
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "soundMap.bad_magnet.smartLoop.magnets[0].quantize"')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Missing required field at "soundMap.bad_magnet.smartLoop.magnets[0].condition"'
                )
            );
        });

        it('should catch missing or invalid fields strictly inside the condition object', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: { health: { defaultValue: 100 } },
                soundMap: {
                    bad_condition: {
                        busId: 'master',
                        smartLoop: {
                            regions: { intro: [0, 100] },
                            magnets: [
                                {
                                    region: 'intro',
                                    targetRegion: 'main',
                                    quantize: 'Immediate',
                                    condition: { param: 123, operator: '>', value: '50' }
                                },
                                {
                                    region: 'intro',
                                    targetRegion: 'main',
                                    quantize: 'Immediate',
                                    condition: {}
                                }
                            ]
                        }
                    }
                }
            };

            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Type Error at "soundMap.bad_condition.smartLoop.magnets[0].condition.param": expected string'
                )
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Type Error at "soundMap.bad_condition.smartLoop.magnets[0].condition.value": expected number'
                )
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Missing required field at "soundMap.bad_condition.smartLoop.magnets[1].condition.param"'
                )
            );
        });

        it('should ERROR if magnet condition references a GameParamId that does not exist in rtpcManifest', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: { known_parameter: { defaultValue: 100 } },
                soundMap: {
                    ghost_param_magnet: {
                        busId: 'master',
                        smartLoop: {
                            regions: { intro: [0, 100] },
                            magnets: [
                                {
                                    region: 'intro',
                                    targetRegion: 'main',
                                    quantize: 'NextBar',
                                    condition: { param: 'unknown_ghost_parameter', operator: '==', value: 1 }
                                }
                            ]
                        }
                    }
                }
            };

            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'SmartLoop "ghost_param_magnet" uses unknown RTPC param "unknown_ghost_parameter" in magnet condition.'
                )
            );
        });

        it('should catch invalid offsetMode values in magnets', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: { health: { defaultValue: 100 } },
                soundMap: {
                    bad_offset: {
                        busId: 'master',
                        smartLoop: {
                            regions: { intro: [0, 100] },
                            magnets: [
                                {
                                    region: 'intro',
                                    targetRegion: 'intro',
                                    quantize: 'Immediate',
                                    offsetMode: 'Absolute',
                                    condition: { param: 'health', operator: '<', value: 50 }
                                },
                                {
                                    region: 'intro',
                                    targetRegion: 'intro',
                                    quantize: 'Immediate',
                                    offsetMode: 123,
                                    condition: { param: 'health', operator: '<', value: 50 }
                                }
                            ]
                        }
                    }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    "magnet has invalid offsetMode \"Absolute\". Expected 'None', 'Relative', or 'Inverted'"
                )
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Type Error at "soundMap.bad_offset.smartLoop.magnets[1].offsetMode": expected string'
                )
            );
        });

        it('should pass valid offsetMode values in magnets', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: { health: { defaultValue: 100 } },
                soundMap: {
                    good_offset: {
                        busId: 'master',
                        smartLoop: {
                            regions: { intro: [0, 100] },
                            magnets: [
                                {
                                    region: 'intro',
                                    targetRegion: 'intro',
                                    quantize: 'Immediate',
                                    offsetMode: 'Relative',
                                    condition: { param: 'health', operator: '<', value: 50 }
                                }
                            ]
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(true);
        });

        it('should pass perfectly valid magnets with hysteresis', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: { intensity: { defaultValue: 0 } },
                soundMap: {
                    music_loop: {
                        busId: 'master',
                        smartLoop: {
                            regions: { intro: [0, 100], main: [100, 200] },
                            magnets: [
                                {
                                    region: 'intro',
                                    targetRegion: 'main',
                                    quantize: 'NextBar',
                                    condition: { param: 'intensity', operator: '>', value: 50, hysteresis: 10 }
                                }
                            ]
                        }
                    }
                }
            };
            expect(ConsistencyChecker.validate(config)).toBe(true);
        });

        it('should catch negative hysteresis in magnet conditions', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: { intensity: { defaultValue: 0 } },
                soundMap: {
                    music_loop: {
                        busId: 'master',
                        smartLoop: {
                            regions: { intro: [0, 100], main: [100, 200] },
                            magnets: [
                                {
                                    region: 'intro',
                                    targetRegion: 'main',
                                    quantize: 'NextBar',
                                    condition: { param: 'intensity', operator: '>', value: 50, hysteresis: -20 }
                                }
                            ]
                        }
                    }
                }
            };
            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Hysteresis at "soundMap.music_loop.smartLoop.magnets[0].condition.hysteresis" cannot be negative.'
                )
            );
        });
    });

    describe('Event Actions (Base Properties: Delay, Probability, Conditions)', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            vi.spyOn(console, 'error').mockImplementation(() => {});
        });

        it('should pass valid base properties (delayMs, probability, condition with hysteresis)', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: { boss_health: { defaultValue: 100 } },
                soundMap: { sfx_hit: { busId: 'master' } },
                events: {
                    smart_event: {
                        actions: [
                            {
                                type: 'play',
                                target: 'sfx_hit',
                                delayMs: 1500,
                                probability: 0.5,
                                condition: { param: 'boss_health', operator: '<=', value: 20, hysteresis: 5 }
                            }
                        ]
                    }
                }
            };

            const isValid = ConsistencyChecker.validate(config);
            expect(isValid).toBe(true);
            expect(console.error).not.toHaveBeenCalled();
        });

        it('should catch negative delayMs', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                soundMap: { sfx: { busId: 'master' } },
                events: {
                    bad_delay: {
                        actions: [{ type: 'play', target: 'sfx', delayMs: -500 }]
                    }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Action at "events.bad_delay.actions[0].delayMs" cannot be negative.')
            );
        });

        it('should catch negative hysteresis in event conditions', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: { hp: { defaultValue: 100 } },
                soundMap: { sfx: { busId: 'master' } },
                events: {
                    bad_hysteresis_event: {
                        actions: [
                            {
                                type: 'play',
                                target: 'sfx',
                                condition: { param: 'hp', operator: '<', value: 20, hysteresis: -10 }
                            }
                        ]
                    }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Action at "events.bad_hysteresis_event.actions[0].condition.hysteresis" cannot be negative.'
                )
            );
        });

        it('should catch out-of-bounds probability', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                soundMap: { sfx: { busId: 'master' } },
                events: {
                    bad_prob_high: {
                        actions: [{ type: 'play', target: 'sfx', probability: 1.5 }]
                    },
                    bad_prob_low: {
                        actions: [{ type: 'play', target: 'sfx', probability: -0.1 }]
                    }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Action at "events.bad_prob_high.actions[0].probability" must be between 0.0 and 1.0.'
                )
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Action at "events.bad_prob_low.actions[0].probability" must be between 0.0 and 1.0.'
                )
            );
        });

        it('should catch invalid conditions (unknown param, wrong operator, missing value)', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: { player_speed: { defaultValue: 0 } },
                soundMap: { sfx: { busId: 'master' } },
                events: {
                    bad_cond_event: {
                        actions: [
                            {
                                type: 'play',
                                target: 'sfx',
                                condition: { param: 'ghost_param', operator: '==', value: 10 }
                            },
                            {
                                type: 'play',
                                target: 'sfx',
                                condition: { param: 'player_speed', operator: '===', value: 10 }
                            },
                            {
                                type: 'play',
                                target: 'sfx',
                                condition: { param: 'player_speed', operator: '==' }
                            }
                        ]
                    }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Event "bad_cond_event" uses unknown RTPC param "ghost_param" in condition')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Invalid operator "===" at events.bad_cond_event.actions[1].condition.operator.'
                )
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "events.bad_cond_event.actions[2].condition.value"')
            );
        });
    });

    describe('Event Actions (Sequencer Integration) Validations', () => {
        it('should pass perfectly valid Sequencer event actions', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                soundMap: {},
                events: {
                    combat_start: {
                        actions: [
                            { type: 'start_loop', target: 'bgm_combat', startRegion: 'intro' },
                            { type: 'play_stinger', target: 'sfx_cymbal', quantize: 'NextBar' },
                            {
                                type: 'music_transition',
                                target: 'bgm_combat',
                                targetRegion: 'phase2',
                                options: { quantize: 'Immediate', offsetMode: 'Relative' }
                            },
                            { type: 'stop_loop', target: 'bgm_explore' }
                        ]
                    }
                }
            };

            const isValid = ConsistencyChecker.validate(config);
            if (!isValid) console.log((ConsistencyChecker as any).errors);

            expect(isValid).toBe(true);
        });

        it('should catch missing required fields in Sequencer actions', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                soundMap: {},
                events: {
                    bad_events: {
                        actions: [
                            { type: 'start_loop', target: 'bgm' },
                            { type: 'music_transition', target: 'bgm' }
                        ]
                    }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "events.bad_events.actions[0].startRegion"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "events.bad_events.actions[1].targetRegion"')
            );
        });

        it('should catch invalid enum values in quantize and offsetMode', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                soundMap: {},
                events: {
                    typo_events: {
                        actions: [
                            {
                                type: 'play_stinger',
                                target: 'sfx',
                                quantize: 'NextFrame'
                            },
                            {
                                type: 'music_transition',
                                target: 'bgm',
                                targetRegion: 'main',
                                options: { offsetMode: 'Absolute' }
                            }
                        ]
                    }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    "has invalid value \"NextFrame\". Expected 'Immediate', 'NextBeat', or 'NextBar'"
                )
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining("has invalid value \"Absolute\". Expected 'None', 'Relative', or 'Inverted'")
            );
        });
    });

    describe('Event Actions (Mixer Integration) Validations', () => {
        it('should pass valid mixer actions under the exact API layout', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                soundMap: {},
                events: {
                    game_paused: {
                        actions: [{ type: 'set_mixer_state', snapshotName: 'snap_pause' }]
                    },
                    explosion_heavy: {
                        actions: [
                            {
                                type: 'add_mixer_modifier',
                                snapshotName: 'snap_deafened',
                                modifierId: 'mod_explosion_1',
                                priority: 100
                            }
                        ]
                    },
                    explosion_ended: {
                        actions: [{ type: 'remove_mixer_modifier', modifierId: 'mod_explosion_1' }]
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(true);
        });

        it('should catch missing fields in mixer actions', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                soundMap: {},
                events: {
                    bad_mixer_event: {
                        actions: [{ type: 'set_mixer_state' }, { type: 'add_mixer_modifier', modifierId: 'mod_1' }]
                    }
                }
            };

            ConsistencyChecker.validate(config);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "events.bad_mixer_event.actions[0].snapshotName"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Missing required field at "events.bad_mixer_event.actions[1].snapshotName"')
            );
        });
    });

    describe('Event Actions (Nested Actions) Validations', () => {
        it('should pass valid nested actions', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                soundMap: {},
                events: {
                    explosion_heavy: {
                        actions: [
                            {
                                type: 'add_mixer_modifier',
                                snapshotName: 'snap_deafened',
                                modifierId: 'mod_explosion_1',
                                priority: 100
                            }
                        ]
                    },
                    explosion_nested: {
                        actions: [{ type: 'trigger_event', target: 'explosion_heavy' }]
                    }
                }
            };

            ConsistencyChecker.validate(config);
        });
        it('should catch invalid nested actions', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                soundMap: {},
                events: {
                    pause_nested: {
                        actions: [{ type: 'trigger_event', target: 'pause_unknown' }]
                    },
                    pause_recursion: {
                        actions: [{ type: 'trigger_event', target: 'pause_recursion' }]
                    }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Event "pause_nested" references missing event target "pause_unknown".')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Event "pause_recursion" references itself in action list.')
            );
        });
    });

    describe('Scatterer Configuration Validations', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.spyOn(console, 'warn').mockImplementation(() => {});
        });

        it('should pass a fully valid scatterer config with sync', () => {
            const config: any = {
                buses: { sfx: {}, music: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                soundMap: {
                    bgm_loop: {
                        busId: 'music',
                        smartLoop: { bpm: 120, regions: {} }
                    },
                    bird_chirp: { busId: 'sfx' },
                    forest_scatterer: {
                        isScatterer: true,
                        busId: 'sfx',
                        sources: ['bird_chirp', { id: 'bird_chirp', weight: 5 }],
                        spawnRateMs: [1000, 2000],
                        scatterDistance: [10, 30],
                        maxPolyphony: 5,
                        sync: {
                            quantize: 'NextBeat',
                            referenceTrackId: 'bgm_loop'
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(true);
        });

        it('should fail if scatterer sources reference unknown sounds', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                soundMap: {
                    bad_scatterer: {
                        isScatterer: true,
                        sources: ['ghost_sound'],
                        spawnRateMs: [100, 200],
                        scatterDistance: [0, 10]
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Source item at "soundMap.bad_scatterer.sources[0]" references missing sound "ghost_sound".'
                )
            );
        });

        it('should fail if tuples are invalid (min > max or wrong length)', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                soundMap: {
                    valid_sfx: { busId: 'sfx' },
                    tuple_error_scatterer: {
                        isScatterer: true,
                        sources: ['valid_sfx'],
                        spawnRateMs: [2000, 1000],
                        scatterDistance: [10]
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('min (2000) cannot be greater than max (1000)')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('must be a tuple of exactly two numbers')
            );
        });

        it('should fail if sync reference track does not exist or is not a smartLoop', () => {
            const config: any = {
                buses: { sfx: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                soundMap: {
                    standard_sound: { busId: 'sfx' },
                    bad_sync_scatterer: {
                        isScatterer: true,
                        sources: ['standard_sound'],
                        spawnRateMs: [100, 200],
                        scatterDistance: [0, 10],
                        sync: {
                            quantize: 'NextBar',
                            referenceTrackId: 'standard_sound'
                        }
                    },
                    ghost_sync_scatterer: {
                        isScatterer: true,
                        sources: ['standard_sound'],
                        spawnRateMs: [100, 200],
                        scatterDistance: [0, 10],
                        sync: {
                            quantize: 'NextBar',
                            referenceTrackId: 'does_not_exist'
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('must be a smartLoop sound to provide a music grid')
            );
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('does not exist in soundMap'));
        });
    });

    describe('Bank System Consistency Validations', () => {
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

        it('should pass a valid, fully integrated bank configuration', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    sfx_ui_click: { busId: 'master' },
                    sfx_step_1: { busId: 'master' },
                    sfx_step_2: { busId: 'master' },
                    container_steps: {
                        isContainer: true,
                        busId: 'master',
                        mode: 'random',
                        sources: ['sfx_step_1', 'sfx_step_2']
                    }
                },
                manifest: {},
                events: {
                    enter_level: {
                        actions: [{ type: 'load_bank', target: 'Bank_Level1' }]
                    }
                },
                banks: {
                    Bank_Global: { sounds: ['sfx_ui_click'] },
                    Bank_Level1: { sounds: ['sfx_step_1', 'sfx_step_2', 'container_steps'] }
                }
            };

            const isValid = ConsistencyChecker.validate(config);

            expect(isValid).toBe(true);
            expect(console.error).not.toHaveBeenCalled();
            expect(console.warn).not.toHaveBeenCalled();
        });

        it('should warn if no banks are defined', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: { sfx_test: { busId: 'master' } },
                banks: {}
            };

            ConsistencyChecker.validate(config);

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('No banks defined. The engine will not be able to load any sounds.')
            );
        });

        it('should catch orphan sounds (in SoundMap but not in any bank)', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    sfx_in_bank: { busId: 'master' },
                    sfx_orphan: { busId: 'master' }
                },
                banks: {
                    Bank_Main: { sounds: ['sfx_in_bank'] }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Sound "sfx_orphan" exists in SoundMap but is not assigned to any Bank')
            );
        });

        it('should catch critical error when a sound is duplicated in multiple banks (Shared Sounds)', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    sfx_shared: { busId: 'master' }
                },
                banks: {
                    Bank_A: { sounds: ['sfx_shared'] },
                    Bank_B: { sounds: ['sfx_shared'] }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Critical: Sound "sfx_shared" is duplicated in multiple banks: [Bank_A, Bank_B]'
                )
            );
        });

        it('should catch sounds referenced in banks that do not exist in SoundMap or Manifest', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {},
                manifest: {},
                banks: {
                    Bank_A: { sounds: ['sfx_ghost'] }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Bank "Bank_A" references missing sound "sfx_ghost".')
            );
        });

        it('should warn if a Container or Scatterer uses sounds from different banks (Cross-Bank Dependency)', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: {
                    sfx_step_forest: { busId: 'master' },
                    sfx_step_desert: { busId: 'master' },
                    container_steps: {
                        isContainer: true,
                        busId: 'master',
                        mode: 'random',
                        sources: ['sfx_step_forest', 'sfx_step_desert']
                    }
                },
                banks: {
                    Bank_Forest: { sounds: ['sfx_step_forest'] },
                    Bank_Desert: { sounds: ['sfx_step_desert'] },
                    Bank_Logic: { sounds: ['container_steps'] }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Container/Scatterer "container_steps" uses sounds from different banks: [Bank_Forest, Bank_Desert]'
                )
            );
        });

        it('should catch invalid bank targets in Event Actions (load_bank / unload_bank)', () => {
            const config: any = {
                buses: { master: {} },
                soundMap: { sfx: { busId: 'master' } },
                banks: { Bank_Valid: { sounds: ['sfx'] } },
                events: {
                    test_event: {
                        actions: [
                            { type: 'load_bank', target: 'Bank_Typo' },
                            { type: 'unload_bank', target: 'Bank_Ghost' }
                        ]
                    }
                }
            };

            ConsistencyChecker.validate(config);

            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Event "test_event" references missing bank "Bank_Typo"')
            );
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Event "test_event" references missing bank "Bank_Ghost"')
            );
        });
    });

    describe('MusicFSM Configuration Validations', () => {
        beforeEach(() => {
            vi.clearAllMocks();
            vi.spyOn(console, 'error').mockImplementation(() => {});
            vi.spyOn(console, 'warn').mockImplementation(() => {});
        });

        it('should pass a fully valid MusicFSM config with all references matching', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: { music_phase: { defaultValue: 1 } },
                events: {},
                manifest: {},
                soundMap: {
                    smartLoop: {
                        busId: 'master',
                        smartLoop: {
                            bpm: 120,
                            regions: {
                                A: [0, 1000],
                                B: [1000, 2000],
                                A_TO_B: [2000, 2500]
                            }
                        }
                    },
                    stinger_sound: { busId: 'master' }
                },
                musicFSM: {
                    initialState: 'phase_A',
                    globalEdges: [],
                    states: {
                        phase_A: {
                            id: 'phase_A',
                            soundId: 'smartLoop',
                            sequencerRegion: 'A',
                            activeSnapshot: 'snapshot_idle',
                            edges: [
                                {
                                    targetState: 'phase_B',
                                    conditions: [{ param: 'music_phase', operator: '==', value: 2 }],
                                    syncRule: 'NextBar',
                                    crossfadeDurationMs: 4000,
                                    transitionRegionName: 'A_TO_B',
                                    stingerId: 'stinger_sound',
                                    interruptable: true
                                }
                            ]
                        },
                        phase_B: {
                            id: 'phase_B',
                            soundId: 'smartLoop',
                            sequencerRegion: 'B',
                            edges: []
                        }
                    }
                },
                snapshots: {
                    snapshot_idle: { layers: {} }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(true);
        });

        it('should fail if initialState points to a non-existent state node', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                soundMap: {},
                snapshots: {},
                musicFSM: {
                    initialState: 'ghost_state',
                    globalEdges: [],
                    states: {
                        real_state: { id: 'real_state', soundId: 's', sequencerRegion: 'R', edges: [] }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should fail if state node references a missing soundId in soundMap', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                soundMap: {},
                snapshots: {},
                musicFSM: {
                    initialState: 'phase_A',
                    globalEdges: [],
                    states: {
                        phase_A: {
                            id: 'phase_A',
                            soundId: 'ghost_sound',
                            sequencerRegion: 'A',
                            edges: []
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should fail if state node soundId is not configured as smartLoop', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                snapshots: {},
                soundMap: {
                    standard_sfx: { busId: 'master' }
                },
                musicFSM: {
                    initialState: 'phase_A',
                    globalEdges: [],
                    states: {
                        phase_A: {
                            id: 'phase_A',
                            soundId: 'standard_sfx',
                            sequencerRegion: 'A',
                            edges: []
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should fail if state node sequencerRegion is missing from smartLoop regions list', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                snapshots: {},
                soundMap: {
                    smartLoop: {
                        busId: 'master',
                        smartLoop: { bpm: 120, regions: { A: [0, 1000] } }
                    }
                },
                musicFSM: {
                    initialState: 'phase_A',
                    globalEdges: [],
                    states: {
                        phase_A: {
                            id: 'phase_A',
                            soundId: 'smartLoop',
                            sequencerRegion: 'GHOST_REGION',
                            edges: []
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should fail if activeSnapshot references a missing snapshot', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                snapshots: {},
                soundMap: {
                    smartLoop: {
                        busId: 'master',
                        smartLoop: { bpm: 120, regions: { A: [0, 1000] } }
                    }
                },
                musicFSM: {
                    initialState: 'phase_A',
                    globalEdges: [],
                    states: {
                        phase_A: {
                            id: 'phase_A',
                            soundId: 'smartLoop',
                            sequencerRegion: 'A',
                            activeSnapshot: 'ghost_snapshot',
                            edges: []
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should fail if a local edge targetState references a non-existent state node', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                snapshots: {},
                soundMap: {
                    smartLoop: {
                        busId: 'master',
                        smartLoop: { bpm: 120, regions: { A: [0, 1000] } }
                    }
                },
                musicFSM: {
                    initialState: 'phase_A',
                    globalEdges: [],
                    states: {
                        phase_A: {
                            id: 'phase_A',
                            soundId: 'smartLoop',
                            sequencerRegion: 'A',
                            edges: [
                                {
                                    targetState: 'ghost_target_state',
                                    conditions: [],
                                    syncRule: 'Immediate',
                                    interruptable: true
                                }
                            ]
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should fail if an edge transitionRegionName is missing from target smartLoop regions list', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                snapshots: {},
                soundMap: {
                    smartLoop: {
                        busId: 'master',
                        smartLoop: { bpm: 120, regions: { A: [0, 1000], B: [1000, 2000] } }
                    }
                },
                musicFSM: {
                    initialState: 'phase_A',
                    globalEdges: [],
                    states: {
                        phase_A: {
                            id: 'phase_A',
                            soundId: 'smartLoop',
                            sequencerRegion: 'A',
                            edges: [
                                {
                                    targetState: 'phase_B',
                                    conditions: [],
                                    syncRule: 'NextBar',
                                    transitionRegionName: 'A_TO_D',
                                    interruptable: true
                                }
                            ]
                        },
                        phase_B: {
                            id: 'phase_B',
                            soundId: 'smartLoop',
                            sequencerRegion: 'B',
                            edges: []
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should fail if an edge stingerId references a missing sound in soundMap', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                snapshots: {},
                soundMap: {
                    smartLoop: {
                        busId: 'master',
                        smartLoop: { bpm: 120, regions: { A: [0, 1000] } }
                    }
                },
                musicFSM: {
                    initialState: 'phase_A',
                    globalEdges: [],
                    states: {
                        phase_A: {
                            id: 'phase_A',
                            soundId: 'smartLoop',
                            sequencerRegion: 'A',
                            edges: [
                                {
                                    targetState: 'phase_A',
                                    conditions: [],
                                    syncRule: 'Immediate',
                                    stingerId: 'ghost_stinger',
                                    interruptable: true
                                }
                            ]
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should fail if an edge condition references a missing parameter in rtpcManifest', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                snapshots: {},
                soundMap: {
                    smartLoop: {
                        busId: 'master',
                        smartLoop: { bpm: 120, regions: { A: [0, 1000] } }
                    }
                },
                musicFSM: {
                    initialState: 'phase_A',
                    globalEdges: [],
                    states: {
                        phase_A: {
                            id: 'phase_A',
                            soundId: 'smartLoop',
                            sequencerRegion: 'A',
                            edges: [
                                {
                                    targetState: 'phase_A',
                                    conditions: [{ param: 'ghost_rtpc_param', operator: '==', value: 1 }],
                                    syncRule: 'Immediate',
                                    interruptable: true
                                }
                            ]
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
        });

        it('should evaluate and fail globalEdges with the exact same rules as local edges', () => {
            const config: any = {
                buses: { master: {} },
                rtpcManifest: {},
                events: {},
                manifest: {},
                snapshots: {},
                soundMap: {
                    smartLoop: {
                        busId: 'master',
                        smartLoop: { bpm: 120, regions: { A: [0, 1000] } }
                    }
                },
                musicFSM: {
                    initialState: 'phase_A',
                    globalEdges: [
                        {
                            targetState: 'ghost_global_target',
                            conditions: [{ param: 'ghost_global_param', operator: '==', value: 1 }],
                            syncRule: 'Immediate',
                            stingerId: 'ghost_global_stinger',
                            interruptable: true
                        }
                    ],
                    states: {
                        phase_A: {
                            id: 'phase_A',
                            soundId: 'smartLoop',
                            sequencerRegion: 'A',
                            edges: []
                        }
                    }
                }
            };

            expect(ConsistencyChecker.validate(config)).toBe(false);
        });
    });
});
