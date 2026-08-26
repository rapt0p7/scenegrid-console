import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest';

import GhostDuckingRule from '../GhostDuckingRule.js';
import { createStubContext } from './helpers/createStubContext';

describe('GhostDuckingRule', () => {
    describe('validate', () => {
        describe('root configuration guards', () => {
            it('should return immediately when snapshots is absent and not attempt to iterate (Line 10)', () => {
                const rule = new GhostDuckingRule();
                const context = createStubContext({
                    snapshots: undefined,
                    buses: { voice: { gain: 0 }, music: { gain: 1 } },
                    soundMap: { sfx_1: { busId: 'voice', ducking: { target: 'music' } } as any }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                expect(() => {
                    rule.validate(context);
                }).not.toThrow();
                expect(context.getWarnings()).toHaveLength(0);
            });

            it('should return immediately when soundMap is absent and not attempt to iterate (Line 10)', () => {
                const rule = new GhostDuckingRule();
                const context = createStubContext({
                    soundMap: undefined,
                    buses: { voice: { gain: 0 } },
                    snapshots: { snap: { buses: { voice: { gain: 0 } } } }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                expect(() => {
                    rule.validate(context);
                }).not.toThrow();
                expect(context.getWarnings()).toHaveLength(0);
            });

            it('should return immediately when buses is absent and not attempt to read keys (Line 10)', () => {
                const rule = new GhostDuckingRule();
                const context = createStubContext({
                    buses: undefined,
                    soundMap: { sfx_1: { busId: 'voice', ducking: { target: 'music' } } as any },
                    snapshots: { snap: { buses: { voice: { gain: 0 } } } }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                expect(() => {
                    rule.validate(context);
                }).not.toThrow();
                expect(context.getWarnings()).toHaveLength(0);
            });
        });

        describe('soundMap entry type guard', () => {
            it('should skip null and primitive entries in soundMap and process subsequent valid sounds (Line 16)', () => {
                const rule = new GhostDuckingRule();
                const context = createStubContext({
                    buses: { voice: { gain: 0 }, music: { gain: 1 } },
                    snapshots: { default_snap: { buses: { voice: { gain: 0 } } } },
                    soundMap: {
                        corruptedNull: null as any,
                        corruptedPrimitive: 123 as any,
                        corruptedString: 'invalid' as any,
                        validSound: {
                            busId: 'voice',
                            ducking: { target: 'music' }
                        } as any
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getWarnings()).toHaveLength(1);
                expect(context.getWarnings()[0]).toContain('Sound "validSound"');
            });
        });

        describe('single string ducking target formatting', () => {
            it('should format single string ducking targets as [targetName] in the warning message (Line 23)', () => {
                const rule = new GhostDuckingRule();
                const context = createStubContext({
                    buses: { voice: { gain: 0 }, music: { gain: 1 } },
                    snapshots: { stealth_snap: { buses: { voice: { gain: 0 } } } },
                    soundMap: {
                        vo_intro: {
                            busId: 'voice',
                            ducking: { target: 'music' }
                        } as any
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getWarnings()[0]).toContain('triggers ducking on [music].');
                expect(context.getWarnings()[0]).not.toContain('triggers ducking on [].');
            });
        });

        describe('snapshot gain resolution and default fallback', () => {
            it('should override active default bus gain when snapshot explicitly sets gain to 0 (Line 31)', () => {
                const rule = new GhostDuckingRule();
                const context = createStubContext({
                    buses: { voice: { gain: 1 }, music: { gain: 1 } },
                    snapshots: {
                        muted_snap: {
                            buses: { voice: { gain: 0 } }
                        }
                    },
                    soundMap: {
                        vo_sound: {
                            busId: 'voice',
                            ducking: { target: 'music' }
                        } as any
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getWarnings()).toHaveLength(1);
                expect(context.getWarnings()[0]).toContain('logical gain of 0 in snapshot "muted_snap"');
            });

            it('should fallback to default bus gain when snapshot does not specify bus gain (Line 35)', () => {
                const rule = new GhostDuckingRule();
                const context = createStubContext({
                    buses: { voice: { gain: 0 }, music: { gain: 1 } },
                    snapshots: {
                        generic_snap: {
                            buses: { voice: {} as any }
                        }
                    },
                    soundMap: {
                        vo_sound: {
                            busId: 'voice',
                            ducking: { target: 'music' }
                        } as any
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getWarnings()).toHaveLength(1);
                expect(context.getWarnings()[0]).toContain('logical gain of 0 in snapshot "generic_snap"');
            });
        });

        describe('audible gain check and verbatim warning verification', () => {
            it('should not emit warnings when bus has a non-zero logical gain (Line 38)', () => {
                const rule = new GhostDuckingRule();
                const context = createStubContext({
                    buses: { voice: { gain: 1 }, music: { gain: 1 } },
                    snapshots: {
                        audible_snap: {
                            buses: { voice: { gain: 0.8 } }
                        }
                    },
                    soundMap: {
                        vo_sound: {
                            busId: 'voice',
                            ducking: { target: 'music' }
                        } as any
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getWarnings()).toHaveLength(0);
            });

            it('should match the verbatim warning string when multiple ducking targets are muted (Lines 40-42)', () => {
                const rule = new GhostDuckingRule();
                const context = createStubContext({
                    buses: { sfx_bus: { gain: 1 }, music: { gain: 1 }, ambient: { gain: 1 } },
                    snapshots: {
                        cutscene_snap: {
                            buses: { sfx_bus: { gain: 0 } }
                        }
                    },
                    soundMap: {
                        explosion: {
                            busId: 'sfx_bus',
                            ducking: { target: ['music', 'ambient'] }
                        } as any
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                rule.validate(context);

                expect(context.getWarnings()).toEqual([
                    'Ghost Ducking Risk: Sound "explosion" on bus "sfx_bus" triggers ducking on [music, ambient]. ' +
                        'However, bus "sfx_bus" has a logical gain of 0 in snapshot "cutscene_snap". ' +
                        'This will cause silent ducking.'
                ]);
            });
        });

        it('should not emit warnings when logical gain is non-zero (Line 38)', () => {
            const rule = new GhostDuckingRule();
            const context = createStubContext({
                buses: { voice: { gain: 1 }, music: { gain: 1 } },
                snapshots: {
                    active_snap: {
                        buses: { voice: { gain: 0.8 } }
                    }
                },
                soundMap: {
                    vo_sound: {
                        busId: 'voice',
                        ducking: { target: ['music'] }
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should match the full warning text when ducking multiple targets on a 0-gain bus (Lines 40-42)', () => {
            const rule = new GhostDuckingRule();
            const context = createStubContext({
                buses: { sfx_bus: { gain: 1 }, music: { gain: 1 }, ambient: { gain: 1 } },
                snapshots: {
                    cutscene_snap: {
                        buses: { sfx_bus: { gain: 0 } }
                    }
                },
                soundMap: {
                    explosion: {
                        busId: 'sfx_bus',
                        ducking: { target: ['music', 'ambient'] }
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toEqual([
                'Ghost Ducking Risk: Sound "explosion" on bus "sfx_bus" triggers ducking on [music, ambient]. ' +
                    'However, bus "sfx_bus" has a logical gain of 0 in snapshot "cutscene_snap". ' +
                    'This will cause silent ducking.'
            ]);
        });
    });
});
