import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

import { describe, expect, it, vi } from 'vitest';

import SoundMapRule from '../SoundMapRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('SoundMapRule', () => {
    describe('validate', () => {
        it('should ignore non-object sound configs', () => {
            const rule = new SoundMapRule();
            const context = createStubContext({
                soundMap: {
                    corrupted: null as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain('Missing required field at "soundMap.corrupted"');
        });

        it('should treat explicit busId: undefined on leaf sounds as missing busId (Line 37)', () => {
            const rule = new SoundMapRule();
            const context = createStubContext({
                buses: { sfx_bus: {} },
                soundMap: {
                    sfx_unassigned: {
                        busId: undefined,
                        src: 'laser.ogg'
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toEqual(['Sound "sfx_unassigned" has no busId']);
        });

        it('should assert exact schema path for busId and pass when bus exists (Lines 38 & 39)', () => {
            const rule = new SoundMapRule();
            const context = createStubContext({
                buses: { sfx_bus: {} },
                soundMap: {
                    sfx_laser: {
                        busId: 'sfx_bus',
                        src: 'laser.ogg'
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            rule.validate(context);

            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('soundMap.sfx_laser.busId', 'sfx_bus', 'string');
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should report verbatim error when busId references an unknown bus (Lines 39 & 40)', () => {
            const rule = new SoundMapRule();
            const context = createStubContext({
                buses: { master: {} },
                soundMap: {
                    sfx_explosion: {
                        busId: 'ghost_bus',
                        src: 'boom.ogg'
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toContain('Sound "sfx_explosion" references unknown bus "ghost_bus"');
        });

        it('should report error when a leaf sound has no busId (Line 43)', () => {
            const rule = new SoundMapRule();
            const context = createStubContext({
                buses: { master: {} },
                soundMap: {
                    leaf_no_bus: {
                        src: 'ambient.ogg'
                    }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toEqual(['Sound "leaf_no_bus" has no busId']);
        });

        it('should exempt smartLoop, isLayered, and isContainer sounds from root busId requirement (Line 42)', () => {
            const rule = new SoundMapRule();
            const context = createStubContext({
                buses: { master: {} },
                soundMap: {
                    smart_sound: {
                        smartLoop: { regions: { r1: [0, 1000] } }
                    } as any,
                    layered_sound: {
                        isLayered: true,
                        layers: []
                    } as any,
                    container_sound: {
                        isContainer: true,
                        mode: 'random',
                        sources: []
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            const noBusErrors = context.getErrors().filter(e => e.includes('has no busId'));
            expect(noBusErrors).toHaveLength(0);
        });
    });
});
