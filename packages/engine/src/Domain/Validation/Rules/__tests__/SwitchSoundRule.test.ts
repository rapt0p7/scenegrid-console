import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it, vi } from 'vitest';

import SwitchSoundRule from '../SwitchSoundRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('SwitchSoundRule', () => {
    describe('validate', () => {
        it('should ignore non-switch sound configs', () => {
            const rule = new SwitchSoundRule();
            const context = createStubContext({});

            rule.validate('sfx', { src: 'audio.ogg' }, context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should not error on switchGroup when rtpcManifest is empty (Line 13)', () => {
            const rule = new SwitchSoundRule();
            const context = createStubContext({ rtpcManifest: {} });

            const switchConfig = {
                isSwitch: true,
                switchGroup: 'surface_type',
                switches: {},
                defaultSwitch: 'sfx_default'
            };

            rule.validate('footsteps', switchConfig as any, context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should report error when rtpcManifest is populated and switchGroup is not registered (Line 13)', () => {
            const rule = new SwitchSoundRule();
            const context = createStubContext({
                rtpcManifest: { known_param: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            const switchConfig = {
                isSwitch: true,
                switchGroup: 'unregistered_param',
                switches: {},
                defaultSwitch: 'sfx_default'
            };

            rule.validate('footsteps', switchConfig as any, context);

            expect(context.getErrors()).toEqual([
                'Switch "footsteps" uses unknown switchGroup (RTPC param) "unregistered_param".'
            ]);
        });

        it('should reject null, arrays, and primitives for switches and abort early (Line 19)', () => {
            const rule = new SwitchSoundRule();
            const contextNull = createStubContext({});
            const contextArray = createStubContext({});
            const contextString = createStubContext({});

            const switchNull = { isSwitch: true, switchGroup: 'g', switches: null as any };
            const switchArray = { isSwitch: true, switchGroup: 'g', switches: ['sfx_1'] as any };
            const switchString = { isSwitch: true, switchGroup: 'g', switches: 'invalid_str' as any };

            rule.validate('s1', switchNull as any, contextNull);
            rule.validate('s2', switchArray as any, contextArray);
            rule.validate('s3', switchString as any, contextString);

            expect(contextNull.getErrors()).toContain('Type Error at "soundMap.s1.switches": expected an object.');
            expect(contextArray.getErrors()).toContain('Type Error at "soundMap.s2.switches": expected an object.');
            expect(contextString.getErrors()).toContain('Type Error at "soundMap.s3.switches": expected an object.');
        });

        it('should warn only when switches is empty AND defaultSwitch is omitted (Line 26)', () => {
            const rule = new SwitchSoundRule();
            const context = createStubContext({});

            const switchEmptyAndNoDefault = {
                isSwitch: true,
                switchGroup: 'g',
                switches: {}
            };

            rule.validate('switch_empty', switchEmptyAndNoDefault as any, context);

            expect(context.getWarnings()).toEqual(['Switch "switch_empty" has empty switches and no defaultSwitch.']);
        });

        it('should not warn when defaultSwitch is provided OR when switches is populated (Line 26)', () => {
            const rule = new SwitchSoundRule();
            const context = createStubContext({
                manifest: { sfx_default: {} as any, sfx_wood: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            const switchWithDefaultOnly = {
                isSwitch: true,
                switchGroup: 'g',
                switches: {},
                defaultSwitch: 'sfx_default'
            };

            const switchWithMappingsOnly = {
                isSwitch: true,
                switchGroup: 'g',
                switches: { wood: 'sfx_wood' }
            };

            rule.validate('switch_default_only', switchWithDefaultOnly as any, context);
            rule.validate('switch_mappings_only', switchWithMappingsOnly as any, context);

            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should assert exact schema path for switches[stateKey] and warn on missing targets (Lines 31 & 33)', () => {
            const rule = new SwitchSoundRule();
            const context = createStubContext({
                manifest: { sfx_wood: {} as any },
                soundMap: { sfx_stone: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            const assertRequiredTypeSpy = vi.spyOn(context, 'assertRequiredType');

            const switchConfig = {
                isSwitch: true,
                switchGroup: 'surface',
                switches: {
                    wood: 'sfx_wood',
                    stone: 'sfx_stone',
                    water: 'sfx_ghost'
                }
            };

            rule.validate('footsteps', switchConfig as any, context);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.footsteps.switches[wood]',
                'sfx_wood',
                'string'
            );
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.footsteps.switches[stone]',
                'sfx_stone',
                'string'
            );
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.footsteps.switches[water]',
                'sfx_ghost',
                'string'
            );
            expect(context.getWarnings()).toEqual(['Switch "footsteps" references missing source "sfx_ghost".']);
        });

        it('should assert schema path and warn only when defaultSwitch is absent from both catalogs (Lines 39 & 41)', () => {
            const rule = new SwitchSoundRule();
            const contextValid = createStubContext({
                manifest: { sfx_fallback: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            const contextInvalid = createStubContext({
                manifest: {},
                soundMap: {}
            });
            const assertRequiredTypeSpy = vi.spyOn(contextValid, 'assertRequiredType');

            const switchValid = {
                isSwitch: true,
                switchGroup: 'g',
                switches: {},
                defaultSwitch: 'sfx_fallback'
            };

            const switchInvalid = {
                isSwitch: true,
                switchGroup: 'g',
                switches: {},
                defaultSwitch: 'sfx_missing'
            };

            rule.validate('s_valid', switchValid as any, contextValid);
            rule.validate('s_invalid', switchInvalid as any, contextInvalid);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.s_valid.defaultSwitch',
                'sfx_fallback',
                'string'
            );
            expect(contextValid.getWarnings()).toHaveLength(0);
            expect(contextInvalid.getWarnings()).toEqual([
                'Switch "s_invalid" references missing defaultSwitch "sfx_missing".'
            ]);
        });

        it('should accept zero hysteresis and assert schema path (Lines 47 & 48)', () => {
            const rule = new SwitchSoundRule();
            const context = createStubContext({
                manifest: { sfx_default: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            const switchConfig = {
                isSwitch: true,
                switchGroup: 'g',
                switches: {},
                defaultSwitch: 'sfx_default',
                hysteresis: 0
            };

            rule.validate('switch_zero_hys', switchConfig as any, context);

            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('soundMap.switch_zero_hys.hysteresis', 0, 'number');
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should reject negative hysteresis with verbatim error (Line 48)', () => {
            const rule = new SwitchSoundRule();
            const context = createStubContext({
                manifest: { sfx_default: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            const switchConfig = {
                isSwitch: true,
                switchGroup: 'g',
                switches: {},
                defaultSwitch: 'sfx_default',
                hysteresis: -1.5
            };

            rule.validate('switch_neg_hys', switchConfig as any, context);

            expect(context.getErrors()).toEqual(['Switch "switch_neg_hys" hysteresis cannot be negative.']);
        });
    });
});
