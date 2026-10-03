import type { AudioFilterType, IFilter } from '@domain/BusSystem/Ports/IFilter.js';

import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { isFilterEqual } from '../filterEquals.js';

const audioFilterTypeArb = fc.constantFrom<AudioFilterType>(
    'lowpass',
    'highpass',
    'bandpass',
    'lowshelf',
    'highshelf',
    'peaking',
    'notch',
    'allpass'
);

const numberArb = fc.integer({
    min: -100000,
    max: 100000
});

const optionalNumberArb = fc.option(numberArb, {
    nil: undefined
});

const biquadFilterArb: fc.Arbitrary<IFilter> = fc.record({
    type: audioFilterTypeArb,
    frequency: numberArb,
    Q: optionalNumberArb
});

const reverbFilterArb: fc.Arbitrary<IFilter> = fc.record({
    type: fc.constant('reverb' as const),
    reverbTime: optionalNumberArb,
    reverbDecay: optionalNumberArb
});

const filterArb = fc.oneof(biquadFilterArb, reverbFilterArb);

describe('isFilterEqual', () => {
    describe('referential equality', () => {
        test.prop([filterArb])('returns true for the same filter reference', filter => {
            expect(isFilterEqual(filter, filter)).toBe(true);
        });

        test.prop([fc.constantFrom(null, undefined)])(
            'returns true when both values are the same absent reference',
            value => {
                expect(isFilterEqual(value, value)).toBe(true);
            }
        );
    });

    describe('absent filters', () => {
        test.prop([filterArb, fc.constantFrom(null, undefined)])(
            'returns false when exactly one filter is absent',
            (filter, absent) => {
                expect(isFilterEqual(filter, absent)).toBe(false);
                expect(isFilterEqual(absent, filter)).toBe(false);
            }
        );

        it('should return false for null and undefined', () => {
            expect(isFilterEqual(null, undefined)).toBe(false);
            expect(isFilterEqual(undefined, null)).toBe(false);
        });
    });

    describe('different filter types', () => {
        test.prop([fc.tuple(audioFilterTypeArb, audioFilterTypeArb).filter(([a, b]) => a !== b)])(
            'returns false when non-reverb filter types differ',
            ([typeA, typeB]) => {
                const a: IFilter = { type: typeA, frequency: 1000, Q: 1 };
                const b: IFilter = { type: typeB, frequency: 1000, Q: 1 };

                expect(isFilterEqual(a, b)).toBe(false);
            }
        );

        test.prop([audioFilterTypeArb])('returns false when one filter is reverb and the other is not', type => {
            const reverb: IFilter = { type: 'reverb', reverbTime: 1, reverbDecay: 1 };
            const biquad: IFilter = { type, frequency: 1000, Q: 1 };

            expect(isFilterEqual(reverb, biquad)).toBe(false);
            expect(isFilterEqual(biquad, reverb)).toBe(false);
        });
    });

    describe('reverb filters', () => {
        it('should return false when reverbTime differs between reverb filters', () => {
            const a: IFilter = { type: 'reverb', reverbTime: 1.5, reverbDecay: 0.5 };
            const b: IFilter = { type: 'reverb', reverbTime: 3.0, reverbDecay: 0.5 };

            expect(isFilterEqual(a, b)).toBe(false);
        });

        it('should return false when reverbDecay differs between reverb filters', () => {
            const a: IFilter = { type: 'reverb', reverbTime: 1.5, reverbDecay: 0.5 };
            const b: IFilter = { type: 'reverb', reverbTime: 1.5, reverbDecay: 1.0 };

            expect(isFilterEqual(a, b)).toBe(false);
        });

        test.prop([optionalNumberArb, optionalNumberArb])(
            'returns true when reverb configurations are equal',
            (reverbTime, reverbDecay) => {
                const a: IFilter = { type: 'reverb', reverbTime, reverbDecay };
                const b: IFilter = { type: 'reverb', reverbTime, reverbDecay };

                expect(isFilterEqual(a, b)).toBe(true);
            }
        );
    });

    describe('non-reverb filters', () => {
        it('should return false when frequency differs between non-reverb filters', () => {
            const a: IFilter = { type: 'lowpass', frequency: 1000, Q: 1 };
            const b: IFilter = { type: 'lowpass', frequency: 2000, Q: 1 };

            expect(isFilterEqual(a, b)).toBe(false);
        });

        it('should return false when Q differs between non-reverb filters', () => {
            const a: IFilter = { type: 'lowpass', frequency: 1000, Q: 1 };
            const b: IFilter = { type: 'lowpass', frequency: 1000, Q: 2 };

            expect(isFilterEqual(a, b)).toBe(false);
        });

        it('should ignore reverb fields when comparing non-reverb filters', () => {
            // @ts-expect-error adding forbidden fields in IBiquadConfig
            const a: IFilter = { type: 'lowpass', frequency: 1000, Q: 1, reverbTime: 2.0 };
            // @ts-expect-error adding forbidden fields in IBiquadConfig
            const b: IFilter = { type: 'lowpass', frequency: 1000, Q: 1, reverbTime: 5.0 };

            expect(isFilterEqual(a, b)).toBe(true);
        });

        it('should compare frequency and Q when filter type is an empty string', () => {
            const a = { type: '' as AudioFilterType, frequency: 1000, Q: 1 } as IFilter;
            const b = { type: '' as AudioFilterType, frequency: 1000, Q: 1 } as IFilter;

            expect(isFilterEqual(a, b)).toBe(true);
        });

        test.prop([audioFilterTypeArb, numberArb, optionalNumberArb])(
            'returns true when non-reverb configurations are equal',
            (type, frequency, Q) => {
                const a: IFilter = { type, frequency, Q };
                const b: IFilter = { type, frequency, Q };

                expect(isFilterEqual(a, b)).toBe(true);
            }
        );
    });

    describe('runtime-inconsistent type getter', () => {
        it('should return false through the final return branch', () => {
            let typeReadCount = 0;

            const a = {
                get type(): AudioFilterType | 'reverb' {
                    typeReadCount++;

                    switch (typeReadCount) {
                        case 1:
                            return 'reverb';

                        case 2:
                            return 'lowpass';

                        default:
                            return 'reverb';
                    }
                },
                frequency: 1000,
                Q: 1
            } as IFilter;

            const b: IFilter = {
                type: 'reverb',
                reverbTime: 1,
                reverbDecay: 1
            };

            const result = isFilterEqual(a, b);

            expect(result).toBe(false);
            expect(typeReadCount).toBe(3);
        });
    });
});
