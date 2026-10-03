import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

import { describe, expect, it, vi } from 'vitest';

import ScattererSoundRule from '../ScattererSoundRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('ScattererSoundRule', () => {
    describe('validate', () => {
        it('should ignore non-scatterer sound configurations', () => {
            const rule = new ScattererSoundRule();
            const context = createStubContext({});
            const validateTupleSpy = vi.spyOn(context, 'validateTuple');

            rule.validate('bgm', { src: 'audio.ogg' }, context);

            expect(validateTupleSpy).not.toHaveBeenCalled();
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should assert exact path for spawnRate and skip scatterDistance when omitted (Lines 19 & 20)', () => {
            const rule = new ScattererSoundRule();
            const context = createStubContext({});
            const validateTupleSpy = vi.spyOn(context, 'validateTuple');

            const scattererConfig = {
                isScatterer: true,
                sources: ['sfx_bird'],
                spawnRate: [1000, 2500] as [number, number]
            };

            rule.validate('birds_ambience', scattererConfig as any, context);

            expect(validateTupleSpy).toHaveBeenCalledWith('soundMap.birds_ambience.spawnRate', [1000, 2500]);
            expect(validateTupleSpy).not.toHaveBeenCalledWith(
                'soundMap.birds_ambience.scatterDistance',
                expect.anything()
            );
        });

        it('should assert exact path for scatterDistance when defined (Line 21)', () => {
            const rule = new ScattererSoundRule();
            const context = createStubContext({});
            const validateTupleSpy = vi.spyOn(context, 'validateTuple');

            const scattererConfig = {
                isScatterer: true,
                sources: ['sfx_bird'],
                spawnRate: [1000, 2500] as [number, number],
                scatterDistance: [5.0, 30.0] as [number, number]
            };

            rule.validate('birds_ambience', scattererConfig as any, context);

            expect(validateTupleSpy).toHaveBeenCalledWith('soundMap.birds_ambience.scatterDistance', [5.0, 30.0]);
        });

        it('should reject maxPolyphony of zero or negative with verbatim error (Lines 26-27)', () => {
            const rule = new ScattererSoundRule();
            const context = createStubContext({});

            const scattererZero = {
                isScatterer: true,
                sources: ['sfx_cricket'],
                spawnRate: [500, 1000] as [number, number],
                maxPolyphony: 0
            };

            const scattererNegative = {
                isScatterer: true,
                sources: ['sfx_cricket'],
                spawnRate: [500, 1000] as [number, number],
                maxPolyphony: -3
            };

            rule.validate('crickets_zero', scattererZero as any, context);
            rule.validate('crickets_neg', scattererNegative as any, context);

            expect(context.getErrors()).toContain(
                'Scatterer "crickets_zero" maxPolyphony must be strictly greater than 0.'
            );
            expect(context.getErrors()).toContain(
                'Scatterer "crickets_neg" maxPolyphony must be strictly greater than 0.'
            );
        });

        it('should assert exact path for maxPolyphony and accept valid positive integers (Lines 24-25)', () => {
            const rule = new ScattererSoundRule();
            const context = createStubContext({});
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            const scattererValid = {
                isScatterer: true,
                sources: ['sfx_cricket'],
                spawnRate: [500, 1000] as [number, number],
                maxPolyphony: 4
            };

            rule.validate('crickets_valid', scattererValid as any, context);

            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('soundMap.crickets_valid.maxPolyphony', 4, 'number');
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should accept all 3 valid quantize values (Immediate, NextBeat, NextBar) (Line 40)', () => {
            const rule = new ScattererSoundRule();
            const quantizeModes = ['Immediate', 'NextBeat', 'NextBar'] as const;

            for (const q of quantizeModes) {
                const context = createStubContext({
                    soundMap: {
                        bgm_grid: { smartLoop: { regions: {} } } as any
                    }
                } as unknown as Partial<IConsistencyCheckerPayload>);

                const scatterer = {
                    isScatterer: true,
                    sources: ['sfx_chime'],
                    spawnRate: [1000, 2000] as [number, number],
                    sync: { quantize: q, referenceTrackId: 'bgm_grid' }
                };

                rule.validate('chimes', scatterer as any, context);
                expect(context.getErrors()).toHaveLength(0);
            }
        });

        it('should reject invalid quantize values and assert schema paths (Lines 33, 37, 42)', () => {
            const rule = new ScattererSoundRule();
            const context = createStubContext({
                soundMap: {
                    bgm_grid: { smartLoop: { regions: {} } } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            const assertRequiredTypeSpy = vi.spyOn(context, 'assertRequiredType');

            const scatterer = {
                isScatterer: true,
                sources: ['sfx_chime'],
                spawnRate: [1000, 2000] as [number, number],
                sync: { quantize: 'NextMeasure' as any, referenceTrackId: 'bgm_grid' }
            };

            rule.validate('chimes_bad_quantize', scatterer as any, context);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.chimes_bad_quantize.sync',
                scatterer.sync,
                'object'
            );
            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.chimes_bad_quantize.sync.quantize',
                'NextMeasure',
                'string'
            );
            expect(context.getErrors()).toContain(
                'Scatterer "chimes_bad_quantize" sync.quantize has invalid value "NextMeasure".'
            );
        });

        it('should assert required string for referenceTrackId and skip lookup if type check fails (Line 47)', () => {
            const rule = new ScattererSoundRule();
            const context = createStubContext({ soundMap: {} });
            const assertRequiredTypeSpy = vi.spyOn(context, 'assertRequiredType');

            const scatterer = {
                isScatterer: true,
                sources: ['sfx_drop'],
                spawnRate: [1000, 2000] as [number, number],
                sync: { quantize: 'Immediate', referenceTrackId: 999 as any }
            };

            rule.validate('rain_drops', scatterer as any, context);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.rain_drops.sync.referenceTrackId',
                999,
                'string'
            );
            expect(context.getErrors()).toContain(
                'Type Error at "soundMap.rain_drops.sync.referenceTrackId": expected string, got number'
            );
            expect(context.getErrors().filter(e => e.includes('does not exist in soundMap'))).toHaveLength(0);
        });

        it('should report errors when referenceTrack is missing from soundMap or is not a smartLoop (Line 47)', () => {
            const rule = new ScattererSoundRule();
            const context = createStubContext({
                soundMap: {
                    sfx_standard: { src: 'audio.ogg' } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            const scattererMissingRef = {
                isScatterer: true,
                sources: ['sfx_drop'],
                spawnRate: [1000, 2000] as [number, number],
                sync: { quantize: 'Immediate', referenceTrackId: 'ghost_track' }
            };

            const scattererNonSmartLoop = {
                isScatterer: true,
                sources: ['sfx_drop'],
                spawnRate: [1000, 2000] as [number, number],
                sync: { quantize: 'Immediate', referenceTrackId: 'sfx_standard' }
            };

            rule.validate('drops_missing_ref', scattererMissingRef as any, context);
            rule.validate('drops_bad_ref', scattererNonSmartLoop as any, context);

            expect(context.getErrors()).toContain(
                'Scatterer sync reference track "ghost_track" at "soundMap.drops_missing_ref.sync" does not exist in soundMap.'
            );
            expect(context.getErrors()).toContain(
                'Scatterer sync reference track "sfx_standard" at "soundMap.drops_bad_ref.sync" must be a smartLoop sound to provide a music grid.'
            );
        });
    });
});
