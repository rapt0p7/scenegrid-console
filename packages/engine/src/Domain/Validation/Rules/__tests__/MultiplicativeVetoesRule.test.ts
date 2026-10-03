import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

import { describe, expect, it } from 'vitest';

import MultiplicativeVetoesRule from '../MultiplicativeVetoesRule.js';
import { createStubContext } from './helpers/createStubContext';

describe('MultiplicativeVetoesRule', () => {
    describe('validate', () => {
        it('should not emit warnings when an RTPC-driven bus has unity gain (1.0) or omitted gain (Line 15)', () => {
            const rule = new MultiplicativeVetoesRule();
            const context = createStubContext({
                buses: {
                    music_unity: {
                        gain: 1.0,
                        rtpc: { gain: {} as any }
                    },
                    ambient_default: {
                        rtpc: { gain: {} as any }
                    }
                }
            });

            rule.validate(context);

            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should emit an orchestration warning when an RTPC-driven bus has base gain < 1.0 (Line 15)', () => {
            const rule = new MultiplicativeVetoesRule();
            const context = createStubContext({
                buses: {
                    music_scaled: {
                        gain: 0.5,
                        rtpc: { gain: {} as any }
                    }
                }
            });

            rule.validate(context);

            expect(context.getWarnings()).toEqual([
                '[Orchestration Rule] Bus "music_scaled" is RTPC-driven for gain, but its base gain is 0.5. RTPC values will be scaled down. Consider setting base gain to 1.0.'
            ]);
        });

        it('should not emit snapshot veto warnings when snapshot gain is 1 (unity) or undefined (Line 27)', () => {
            const rule = new MultiplicativeVetoesRule();
            const context = createStubContext({
                buses: {
                    music: {
                        gain: 1.0,
                        rtpc: { gain: {} as any }
                    }
                },
                snapshots: {
                    normal_state: {
                        buses: {
                            music: { gain: 1 }
                        }
                    },
                    filter_only_state: {
                        buses: {
                            music: {} as any
                        }
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should emit MUTES warning when snapshot sets gain to 0, and SCALES warning when gain is non-zero and non-one (Line 27)', () => {
            const rule = new MultiplicativeVetoesRule();
            const context = createStubContext({
                buses: {
                    music: {
                        gain: 1.0,
                        rtpc: { gain: {} as any }
                    },
                    ambient: {
                        gain: 1.0,
                        rtpc: { gain: {} as any }
                    }
                },
                snapshots: {
                    pause_menu: {
                        buses: {
                            music: { gain: 0 },
                            ambient: { gain: 0.25 }
                        }
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            const warnings = context.getWarnings();
            expect(warnings).toContain(
                '[Multiplicative Veto] Snapshot "pause_menu" explicitly MUTES gain (0) for bus "music", which is RTPC-driven. This overrides the RTPC curve (Final = 0 * RTPC).'
            );
            expect(warnings).toContain(
                '[Multiplicative Veto] Snapshot "pause_menu" explicitly SCALES gain (0.25) for bus "ambient", which is RTPC-driven. This overrides the RTPC curve (Final = 0.25 * RTPC).'
            );
        });

        it('should not emit multiplicative veto warnings when snapshot modifies gain on a non-RTPC bus (Line 27)', () => {
            const rule = new MultiplicativeVetoesRule();
            const context = createStubContext({
                buses: {
                    static_sfx: {
                        gain: 1.0
                    }
                },
                snapshots: {
                    stealth_mode: {
                        buses: {
                            static_sfx: { gain: 0 }
                        }
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toHaveLength(0);
        });
    });
});
