import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ConsistencyChecker from '../ConsistencyChecker';

import type { IAudioEngineConfig } from '../../interfaces/IAudioEngineConfig';

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
        const validConfig: IAudioEngineConfig = {
            manifest: { shoot: { url: 'sfx/shoot.mp3' } },
            buses: {
                master: { gain: 1 },
                sfx: { gain: 0.8, sends: { master: 1 } }
            },
            soundMap: {
                gun_fire: { busId: 'sfx', src: 'shoot' }
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
    });

    describe('Snapshot Validations', () => {
        it('should catch unknown buses and validate filters inside snapshots', () => {
            const config: any = {
                buses: { master: {} },
                snapshots: {
                    snap1: {
                        buses: {
                            ghost_bus: { gain: 1 }, // Unknown bus
                            master: { filter: { type: 'lowpass' } }, // Valid filter
                            master_bad: { filter: { type: 123 } } // Invalid filter type
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
                snapshotsConfig: {}
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
                snapshotsConfig: {}
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
                snapshotsConfig: {}
            });

            (checker as any).run();
            expect((checker as any).errors.some((error: string) => error.includes('invalid type "magic-curve"'))).toBe(
                true
            );
        });
    });
});
