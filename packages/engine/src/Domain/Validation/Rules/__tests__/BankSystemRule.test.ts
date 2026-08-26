/* eslint-disable @typescript-eslint/naming-convention */
// oxlint-disable typescript/no-unnecessary-type-parameters
// noinspection D

import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload.js';

import { BankId, SoundId } from '@scene-grid/shared';
import { describe, expect, it, vi } from 'vitest';

import BankSystemRule from '../BankSystemRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('BankSystemRule', () => {
    describe('validate', () => {
        it('should warn when no banks are defined in the payload', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({ banks: {} });

            rule.validate(context);

            expect(context.getWarnings()).toContain(
                'No banks defined. The engine will not be able to load any sounds.'
            );
        });

        it('should abort validation when root banks object fails schema validation', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({ banks: 'invalid' as any });

            rule.validate(context);

            expect(context.getErrors()).toContain('Type Error at "banks": expected object, got string');
        });

        it('should report error when bank contains non-string sound IDs', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({
                banks: {
                    ['bank1' as BankId]: { id: 'bank1' as BankId, sounds: ['valid-sound', 123 as any, null as any] }
                }
            });

            rule.validate(context);

            expect(context.getErrors()).toContain('Bank "bank1" contains non-string sound ID.');
        });

        it('should report critical error when a sound is duplicated across multiple banks', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({
                banks: {
                    bankA: { id: 'bankA' as BankId, sounds: ['sfx_shared' as SoundId] },
                    bankB: { id: 'bankB' as BankId, sounds: ['sfx_shared' as SoundId] }
                }
            });

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'Critical: Sound "sfx_shared" is duplicated in multiple banks: [bankA, bankB]. Extract it to a shared bank.'
            );
        });

        it('should report missing sound target when bank references sound absent from soundMap and manifest', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({
                banks: {
                    ['bank1' as BankId]: { id: 'bank1' as BankId, sounds: ['sfx_ghost' as SoundId] }
                },
                soundMap: { ['sfx_real' as SoundId]: { src: 'real.ogg' } as any },
                manifest: {}
            });

            rule.validate(context);

            expect(context.getErrors()).toContain('Bank "bank1" references missing sound "sfx_ghost".');
        });

        it('should exempt containers, scatterers, and switches from direct bank assignment', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({
                banks: {
                    ['bank1' as BankId]: { id: 'bank1' as BankId, sounds: ['sfx_audio' as SoundId] }
                },
                soundMap: {
                    ['sfx_audio' as SoundId]: { src: 'audio.ogg' } as any,
                    ['container_sound' as SoundId]: { isContainer: true, sources: ['sfx_audio'] } as any,
                    ['scatterer_sound' as SoundId]: { isScatterer: true, sources: ['sfx_audio'] } as any,
                    ['switch_sound' as SoundId]: { isSwitch: true, switches: { state1: 'sfx_audio' } } as any
                }
            });

            rule.validate(context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should report error when a leaf sound exists in soundMap but is not assigned to any bank', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({
                banks: {
                    ['bank1' as BankId]: { id: 'bank1' as BankId, sounds: ['sfx_included' as SoundId] }
                },
                soundMap: {
                    ['sfx_included' as SoundId]: { src: 'included.ogg' } as any,
                    ['sfx_forgotten' as SoundId]: { src: 'forgotten.ogg' } as any
                }
            });

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'Sound "sfx_forgotten" exists in SoundMap but is not assigned to any Bank. It will never be loaded.'
            );
        });

        it('should warn when a container/scatterer references sounds from different banks', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({
                banks: {
                    ['ambienceBank' as BankId]: { id: 'ambienceBank' as BankId, sounds: ['sfx_bird' as SoundId] },
                    ['weatherBank' as BankId]: { id: 'weatherBank' as BankId, sounds: ['sfx_wind' as SoundId] }
                },
                soundMap: {
                    ['outdoor_scatterer' as SoundId]: {
                        isScatterer: true,
                        sources: ['sfx_bird', { id: 'sfx_wind', weight: 2 }]
                    } as any
                }
            });

            rule.validate(context);

            expect(context.getWarnings()).toContain(
                'Container/Scatterer "outdoor_scatterer" uses sounds from different banks: [ambienceBank, weatherBank]. Ensure they are loaded together to avoid missing sounds.'
            );
        });

        it('should assert bank object schema with exact path and skip invalid bank configs (Line 20)', () => {
            const rule = new BankSystemRule();
            const assertRequiredTypeSpy = vi.fn().mockImplementation((path, val, type) => {
                return typeof val === type && val !== null;
            });
            const assertArraySpy = vi.fn().mockReturnValue(true);

            const context = createStubContext({
                banks: {
                    invalidBank: 'not-an-object' as any,
                    validBank: { sounds: ['sfx_jump'] }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            context.assertRequiredType = assertRequiredTypeSpy;
            context.assertArray = assertArraySpy;

            rule.validate(context);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith('banks.invalidBank', 'not-an-object', 'object');
            expect(assertArraySpy).not.toHaveBeenCalledWith(
                'banks.invalidBank.sounds',
                expect.anything(),
                expect.anything()
            );
            expect(assertArraySpy).toHaveBeenCalledWith('banks.validBank.sounds', ['sfx_jump'], false);
        });

        it('should enforce required non-optional sounds array and skip sound iteration when sounds is missing (Line 21)', () => {
            const rule = new BankSystemRule();
            const assertArraySpy = vi.fn().mockImplementation((path, val, isOptional) => {
                if (val === undefined && !isOptional) return false;
                return Array.isArray(val);
            });

            const context = createStubContext({
                banks: {
                    missingSoundsBank: {} as any,
                    validBank: { sounds: ['sfx_laser'] }
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            context.assertArray = assertArraySpy;

            rule.validate(context);

            expect(assertArraySpy).toHaveBeenCalledWith('banks.missingSoundsBank.sounds', undefined, false);
            expect(assertArraySpy).toHaveBeenCalledWith('banks.validBank.sounds', ['sfx_laser'], false);
        });

        it('should safely short-circuit missing sound verification when soundMap or manifest is undefined (Line 35)', () => {
            const rule = new BankSystemRule();
            const contextWithoutSoundMap = createStubContext({
                banks: { mainBank: { sounds: ['sfx_ambient'] } },
                soundMap: undefined,
                manifest: { sfx_ambient: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            const contextWithoutManifest = createStubContext({
                banks: { mainBank: { sounds: ['sfx_ambient'] } },
                soundMap: { sfx_ambient: {} as any },
                manifest: undefined
            } as unknown as Partial<IConsistencyCheckerPayload>);

            expect(() => {
                rule.validate(contextWithoutSoundMap);
            }).not.toThrow();
            expect(() => {
                rule.validate(contextWithoutManifest);
            }).not.toThrow();
            expect(contextWithoutSoundMap.getErrors()).toHaveLength(0);
            expect(contextWithoutManifest.getErrors()).toHaveLength(0);
        });

        it('should skip non-object and null soundMap entries during cross-bank analysis (Line 66)', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({
                banks: { mainBank: { sounds: ['sfx_step'] } },
                soundMap: {
                    sfx_primitive_string: 'invalid' as any,
                    sfx_primitive_number: 42 as any,
                    sfx_null_value: null as any,
                    sfx_valid_container: {
                        isContainer: true,
                        sources: ['sfx_step']
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should skip source inspection when container sources property is not an array (Line 70)', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({
                banks: { mainBank: { sounds: ['sfx_wood'] } },
                soundMap: {
                    invalidContainerA: { isContainer: true, sources: undefined as any } as any,
                    invalidContainerB: { isContainer: true, sources: 'not-an-array' as any } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            expect(() => {
                rule.validate(context);
            }).not.toThrow();
            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should ignore null and undefined items inside container sources array (Line 73)', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({
                banks: { mainBank: { sounds: ['sfx_click'] } },
                soundMap: {
                    sparseContainer: {
                        isContainer: true,
                        sources: ['sfx_click', null as any, undefined as any]
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            expect(() => {
                rule.validate(context);
            }).not.toThrow();
            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should not add undefined to referencedBanks when target sound has an empty bank list (Line 77)', () => {
            const rule = new BankSystemRule();
            const context = createStubContext({
                banks: {
                    bankA: { sounds: ['sfx_assigned'] }
                },
                soundMap: {
                    sfx_assigned: { src: 'assigned.ogg' } as any,
                    comboContainer: {
                        isContainer: true,
                        sources: ['sfx_assigned', 'sfx_unassigned']
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            const crossBankWarnings = context.getWarnings().filter(w => w.includes('uses sounds from different banks'));
            expect(crossBankWarnings).toHaveLength(0);
        });
    });
});
