import type {
    ISoundConfig,
    IScattererSoundConfig,
    ISwitchSoundConfig
} from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload.js';
import type { IConsistencyReporter } from '@domain/Validation/Ports/IConsistencyReporter.js';
import type { GameParamId, IConsistencyReportData, Milliseconds, SoundId } from '@scene-grid/shared';

import { fc, it as itProp } from '@fast-check/vitest';
import { describe, expect, it } from 'vitest';

import ValidationContext from '../ValidationContext.js';

describe('ValidationContext', () => {
    describe('constructor', () => {
        it('should populate default fallback configuration and safe defaults when given an empty payload', () => {
            const emptyPayload: IConsistencyCheckerPayload = {};

            const context = new ValidationContext(emptyPayload);

            expect(context.config.ramQuotaMb).toBe(Number.MAX_SAFE_INTEGER);
            expect(context.config.soundMap).toEqual({});
            expect(context.config.manifest).toEqual({});
            expect(context.config.events).toEqual({});
            expect(context.getIsConsistent()).toBe(true);
        });
    });

    describe('assertRequiredType', () => {
        it('should validate matching primitive types successfully', () => {
            const context = createContext();

            const isStringValid = context.assertRequiredType('sound.name', 'footstep_wood', 'string');
            const isNumberValid = context.assertRequiredType('sound.volume', 0.8, 'number');
            const isObjectValid = context.assertRequiredType('sound.rtpc', { pitch: 1 }, 'object');

            expect(isStringValid).toBe(true);
            expect(isNumberValid).toBe(true);
            expect(isObjectValid).toBe(true);
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should record an error when a required field is missing or undefined', () => {
            const context = createContext();

            const isValid = context.assertRequiredType('sound.busId', undefined, 'string');

            expect(isValid).toBe(false);
            expect(context.getErrors()).toContain('Missing required field at "sound.busId"');
            expect(context.getIsConsistent()).toBe(false);
        });

        it('should reject arrays when an object type is expected', () => {
            const context = createContext();

            const isValid = context.assertRequiredType('sound.rtpc', ['pitch', 'volume'], 'object');

            expect(isValid).toBe(false);
            expect(context.getErrors()).toContain('Type Error at "sound.rtpc": expected object, got array');
        });

        itProp.prop([fc.string(), fc.string()])(
            'should always accept string values for expected string type',
            (path, value) => {
                const context = createContext();

                const isValid = context.assertRequiredType(path, value, 'string');

                expect(isValid).toBe(true);
                expect(context.getErrors()).toHaveLength(0);
            }
        );
    });

    describe('validateTuple', () => {
        it('should accept a valid [min, max] range tuple where min <= max', () => {
            const context = createContext();
            const pitchRange: [number, number] = [0.8, 1.2];

            context.validateTuple('voice.pitchRange', pitchRange);

            expect(context.getErrors()).toHaveLength(0);
            expect(context.getIsConsistent()).toBe(true);
        });

        it('should record an error when tuple element count is not exactly 2', () => {
            const context = createContext();
            const invalidTuple = [0.5, 1.0, 1.5];

            context.validateTuple('voice.pitchRange', invalidTuple);

            expect(context.getErrors()).toContain(
                'Field "voice.pitchRange" must be a tuple of exactly two numbers [min, max].'
            );
        });

        it('should delegate to assertArray and early return for non-arrays and undefined', () => {
            const context1 = createContext();
            // oxlint-disable-next-line unicorn/no-useless-undefined
            context1.validateTuple('range', undefined);
            expect(context1.getErrors()).toContain('Missing required array at "range"');

            const context2 = createContext();
            context2.validateTuple('range', 'not-an-array');
            expect(context2.getErrors()).toContain('Type Error at "range": expected array, got string');
        });

        it('should record an error when tuple elements are not numeric', () => {
            const context1 = createContext();
            context1.validateTuple('range', ['0.5', '1.0']);
            expect(context1.getErrors()).toContain('Elements in tuple "range" must be numbers.');

            const context2 = createContext();
            context2.validateTuple('range', [0.5, '1.0']);
            expect(context2.getErrors()).toContain('Elements in tuple "range" must be numbers.');

            const context3 = createContext();
            context3.validateTuple('range', ['0.5', 1.0]);
            expect(context3.getErrors()).toContain('Elements in tuple "range" must be numbers.');
        });

        itProp.prop([fc.double({ noNaN: true }), fc.double({ noNaN: true })])(
            'should enforce min <= max ordering invariant for any numeric bounds',
            (a, b) => {
                const min = Math.min(a, b);
                const max = Math.max(a, b);
                const invertedTuple = [max, min];
                const validTuple = [min, max];

                const validContext = createContext();
                const invalidContext = createContext();

                validContext.validateTuple('range.valid', validTuple);

                expect(validContext.getErrors()).toHaveLength(0);

                if (max > min) {
                    invalidContext.validateTuple('range.inverted', invertedTuple);
                    expect(invalidContext.getErrors()).toContain(
                        `Invalid tuple at "range.inverted": min (${max}) cannot be greater than max (${min}).`
                    );
                }
            }
        );
    });

    describe('checkTargetExists', () => {
        it('should not add a warning when the target exists in either manifest or soundMap', () => {
            const context = new ValidationContext({
                manifest: { ['sfx_jump' as SoundId]: {} as any },
                soundMap: { ['sfx_land' as SoundId]: {} as any }
            });

            context.checkTargetExists('evt_player_jump', 'actions[0].target', 'sfx_jump');
            context.checkTargetExists('evt_player_land', 'actions[0].target', 'sfx_land');

            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should record a warning when target sound is absent from both manifest and soundMap', () => {
            const context = new ValidationContext({
                manifest: {},
                soundMap: {}
            });

            context.checkTargetExists('evt_explosion', 'actions[0].target', 'sfx_missing_boom');

            expect(context.getWarnings()).toContain(
                'Event "evt_explosion" references missing sound target "sfx_missing_boom" at actions[0].target.'
            );
            expect(context.getIsConsistent()).toBe(true);
        });
    });

    describe('type guards', () => {
        it('should correctly discriminate sound configuration types', () => {
            const context = createContext();

            const scattererConfig: IScattererSoundConfig = {
                isScatterer: true,
                sources: ['sfx_bird_1' as SoundId],
                spawnRate: [1000 as Milliseconds, 3000 as Milliseconds]
            };

            const switchConfig: ISwitchSoundConfig = {
                isSwitch: true,
                switchGroup: 'surface_type' as GameParamId,
                switches: { wood: 'sfx_footstep_wood' as SoundId, stone: 'sfx_footstep_stone' as SoundId }
            };

            const baseConfig: ISoundConfig = {
                src: 'ambient_forest.ogg'
            };

            expect(context.isScatterer(scattererConfig)).toBe(true);
            expect(context.isScatterer(baseConfig)).toBe(false);

            expect(context.isSwitch(switchConfig)).toBe(true);
            expect(context.isSwitch(baseConfig)).toBe(false);
        });
    });

    describe('report', () => {
        it('should deliver immutable report snapshot to all configured reporters', () => {
            const reporterA = new StubReporter();
            const reporterB = new StubReporter();
            const context = new ValidationContext({}, { reporters: [reporterA, reporterB] });

            context.addWarning('Deprecation: use bus routing instead');
            context.addError('Invalid sample rate');

            context.report();

            expect(reporterA.lastReport).toEqual({
                errors: ['Invalid sample rate'],
                warnings: ['Deprecation: use bus routing instead'],
                isConsistent: false
            });
            expect(reporterB.lastReport).toEqual(reporterA.lastReport);
        });
    });

    describe('ValidationContext Mutant Protections', () => {
        describe('assertOptionalType', () => {
            it('should return true and record no errors when an optional field is absent', () => {
                const context = createContext();

                const result = context.assertOptionalType('sound.tail', undefined, 'string');

                expect(result).toBe(true);
                expect(context.getErrors()).toHaveLength(0);
                expect(context.getIsConsistent()).toBe(true);
            });
        });

        describe('assertArray', () => {
            it('should return true and record no errors when an optional array is absent', () => {
                const context = createContext();

                const result = context.assertArray('sound.scatterDistance', undefined, true);

                expect(result).toBe(true);
                expect(context.getErrors()).toHaveLength(0);
            });

            it('should return false and record an error when a non-array value is provided', () => {
                const context = createContext();

                const result = context.assertArray('sound.sources', 'invalid_string_source', false);

                expect(result).toBe(false);
                expect(context.getErrors()).toContain('Type Error at "sound.sources": expected array, got string');
            });
        });

        describe('validateTuple', () => {
            it('should accept boundary tuples where min equals max (min === max)', () => {
                const context = createContext();
                const fixedRange: [number, number] = [100, 100];

                context.validateTuple('sound.spawnRate', fixedRange);

                expect(context.getErrors()).toHaveLength(0);
                expect(context.getIsConsistent()).toBe(true);
            });
        });

        describe('isLayered', () => {
            it('should return false when isLayered is false or missing', () => {
                const context = createContext();

                expect(context.isLayered({ isLayered: false } as any)).toBe(false);
                expect(context.isLayered({} as any)).toBe(false);
            });

            it('should return false when input is null or a primitive', () => {
                const context = createContext();

                expect(context.isLayered(null as any)).toBe(false);
                expect(context.isLayered('primitive' as any)).toBe(false);
            });
        });

        describe('isContainer', () => {
            it('should return false when isContainer is false or missing', () => {
                const context = createContext();

                expect(context.isContainer({ isContainer: false } as any)).toBe(false);
                expect(context.isContainer({} as any)).toBe(false);
            });

            it('should return false when input is null or a primitive', () => {
                const context = createContext();

                expect(context.isContainer(null as any)).toBe(false);
                expect(context.isContainer(123 as any)).toBe(false);
            });
        });

        describe('isScatterer', () => {
            it('should return false when isScatterer is false or missing', () => {
                const context = createContext();

                expect(context.isScatterer({ isScatterer: false } as any)).toBe(false);
                expect(context.isScatterer({} as any)).toBe(false);
            });

            it('should return false when input is null or a primitive', () => {
                const context = createContext();

                expect(context.isScatterer(null as any)).toBe(false);
                expect(context.isScatterer('primitive' as any)).toBe(false);
            });
        });

        describe('isSwitch', () => {
            it('should return false when isSwitch is false or missing', () => {
                const context = createContext();

                expect(context.isSwitch({ isSwitch: false } as any)).toBe(false);
                expect(context.isSwitch({} as any)).toBe(false);
            });

            it('should return falsy when input is null or undefined or a primitive', () => {
                const context = createContext();

                expect(context.isSwitch(null as any)).toBeFalsy();
                expect(context.isSwitch(undefined as any)).toBeFalsy();
                expect(context.isSwitch(123 as any)).toBeFalsy();
            });
        });

        describe('isSmartLoop', () => {
            it('should return false when smartLoop property is missing', () => {
                const context = createContext();

                expect(context.isSmartLoop({ busId: 'music' } as any)).toBe(false);
                expect(context.isSmartLoop({} as any)).toBe(false);
            });

            it('should return false when input is null or undefined', () => {
                const context = createContext();

                expect(context.isSmartLoop(null as any)).toBe(false);
                expect(context.isSmartLoop(undefined as any)).toBe(false);
            });
        });
    });
});

function createContext(payload: IConsistencyCheckerPayload = {}): ValidationContext {
    return new ValidationContext(payload);
}

class StubReporter implements IConsistencyReporter {
    public lastReport: IConsistencyReportData | null = null;

    public report(data: IConsistencyReportData): void {
        this.lastReport = data;
    }
}
