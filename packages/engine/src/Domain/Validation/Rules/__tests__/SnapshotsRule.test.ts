import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload.js';

import { describe, expect, it, vi } from 'vitest';

import SnapshotsRule from '../SnapshotsRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('SnapshotsRule', () => {
    describe('validate', () => {
        it('should safely fall back when buses config is undefined (Line 13)', () => {
            const rule = new SnapshotsRule();
            const context = createStubContext({});
            // @ts-expect-error Rewriting for test
            context.config.buses = undefined as any;
            // @ts-expect-error Rewriting for test
            context.config.snapshots = {
                default_snap: { buses: { master: { gain: 1 } } } as any
            };

            rule.validate(context);

            expect(context.getErrors()).toContain('Snapshot "default_snap" refers to unknown bus "master"');
        });

        it('should not error when snapshot references an existing bus, and error when bus is unknown (Line 24)', () => {
            const rule = new SnapshotsRule();
            const context = createStubContext({
                buses: {
                    master: {},
                    sfx: {}
                },
                snapshots: {
                    pause_menu: {
                        buses: {
                            master: { gain: 0.5 },
                            unknown_bus: { gain: 0 }
                        }
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toEqual(['Snapshot "pause_menu" refers to unknown bus "unknown_bus"']);
        });

        it('should not call assertOptionalType for gain when gain is omitted (Line 28)', () => {
            const rule = new SnapshotsRule();
            const context = createStubContext({
                buses: { sfx: {} },
                snapshots: {
                    filter_only: {
                        buses: {
                            sfx: { filter: { type: 'lowpass' } }
                        }
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            rule.validate(context);

            expect(assertOptionalTypeSpy).not.toHaveBeenCalledWith(
                'snapshots.filter_only.buses.sfx.gain',
                expect.anything(),
                expect.anything()
            );
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should assert exact schema paths for gain, filter.type, sends, and sends.<targetBus> (Lines 29, 34, 42, 48)', () => {
            const rule = new SnapshotsRule();
            const context = createStubContext({
                buses: {
                    music: {},
                    reverb: {}
                },
                snapshots: {
                    combat_snap: {
                        buses: {
                            music: {
                                gain: 0.8,
                                filter: { type: 'highpass' },
                                sends: { reverb: 0.25 }
                            }
                        }
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');
            const assertRequiredTypeSpy = vi.spyOn(context, 'assertRequiredType');

            rule.validate(context);

            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('snapshots.combat_snap.buses.music.gain', 0.8, 'number');
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'snapshots.combat_snap.buses.music.filter.type',
                'highpass',
                'string'
            );
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                'snapshots.combat_snap.buses.music.sends',
                { reverb: 0.25 },
                'object'
            );
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                'snapshots.combat_snap.buses.music.sends.reverb',
                0.25,
                'number'
            );
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should pass when snapshot bus sends to an existing bus, and error when target bus is unknown (Line 52)', () => {
            const rule = new SnapshotsRule();
            const context = createStubContext({
                buses: {
                    sfx: {},
                    reverb: {}
                },
                snapshots: {
                    reverb_snap: {
                        buses: {
                            sfx: {
                                sends: {
                                    reverb: 0.5,
                                    ghost_reverb: 0.2
                                }
                            }
                        }
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toEqual([
                'Snapshot "reverb_snap" bus "sfx" sends to unknown bus "ghost_reverb"'
            ]);
        });

        it('should delegate to RTPCRule with exact snapshot bus schema path (Line 60)', () => {
            const rule = new SnapshotsRule();
            const context = createStubContext({
                buses: { music: {} },
                snapshots: {
                    ducking_snap: {
                        buses: {
                            music: {
                                rtpc: {
                                    invalidTarget: {} as any
                                }
                            }
                        }
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'snapshots.ducking_snap.buses.music.rtpc.invalidTarget uses unknown RTPC target "invalidTarget".'
            );
        });
    });
});
