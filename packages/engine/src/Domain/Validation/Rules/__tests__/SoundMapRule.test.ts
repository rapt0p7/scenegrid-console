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
                        busId: undefined
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
                        busId: 'sfx_bus'
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
                        busId: 'ghost_bus'
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
                    leaf_no_bus: {} as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toEqual(['Sound "leaf_no_bus" has no busId']);
        });

        it('should exempt isContainer, isSwitch, and isScatterer from root busId requirement and require busId on smartLoop and isLayered', () => {
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
                    } as any,
                    switch_sound: {
                        isSwitch: true,
                        switchGroup: 'surface',
                        switches: {}
                    } as any,
                    scatterer_sound: {
                        isScatterer: true,
                        sources: ['sfx_leaf'],
                        spawnRate: [100, 200]
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            const noBusErrors = context.getErrors().filter(e => e.includes('has no busId'));
            expect(noBusErrors).toEqual(['Sound "smart_sound" has no busId', 'Sound "layered_sound" has no busId']);
        });

        it('should allow optional valid busId on switches and reject unknown switch busId', () => {
            const rule = new SoundMapRule();
            const context = createStubContext({
                buses: { sfx: {} },
                soundMap: {
                    child: { busId: 'sfx' },
                    switch_optional: {
                        isSwitch: true,
                        switchGroup: 'surface',
                        switches: { 0: 'child' }
                    } as any,
                    switch_override_ok: {
                        isSwitch: true,
                        busId: 'sfx',
                        switchGroup: 'surface',
                        switches: { 0: 'child' }
                    } as any,
                    switch_override_bad: {
                        isSwitch: true,
                        busId: 'missing_bus',
                        switchGroup: 'surface',
                        switches: { 0: 'child' }
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toEqual(['Sound "switch_override_bad" references unknown bus "missing_bus"']);
        });

        it('should pass scatterers without busId and reject scatterers that specify busId', () => {
            const rule = new SoundMapRule();
            const context = createStubContext({
                buses: { sfx: {} },
                soundMap: {
                    child: { busId: 'sfx' },
                    valid_scatterer: {
                        isScatterer: true,
                        sources: ['child'],
                        spawnRate: [100, 200]
                    } as any,
                    invalid_scatterer: {
                        isScatterer: true,
                        busId: 'sfx',
                        sources: ['child'],
                        spawnRate: [100, 200]
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toEqual([
                'Scatterer "invalid_scatterer" does not support "busId"; scatterer voices inherit routing from child sounds.'
            ]);
        });
    });
});
