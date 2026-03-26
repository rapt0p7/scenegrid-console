import { describe, it, expect } from 'vitest';

import { evaluateRTPCCurve } from '../rtpcMath';

import type { MathCurveDefinition, Point2D } from '../../types/curves';

describe('evaluateRTPCCurve', () => {
    describe('Edge Cases', () => {
        it('should return 0 if curve is undefined or null', () => {
            expect(evaluateRTPCCurve(50, null as any)).toBe(0);
            expect(evaluateRTPCCurve(50, undefined as any)).toBe(0);
        });
    });

    describe('Piecewise Linear (Array of points)', () => {
        it('should return 0 for an empty array', () => {
            expect(evaluateRTPCCurve(50, [])).toBe(0);
        });

        it('should return the only point y-value for an array with 1 point', () => {
            expect(evaluateRTPCCurve(50, [{ x: 10, y: 5 }])).toBe(5);
        });

        const curve: Point2D[] = [
            { x: 0, y: 0 },
            { x: 100, y: 1 }
        ];

        it('should clamp to first point if input is <= min x', () => {
            expect(evaluateRTPCCurve(-10, curve)).toBe(0);
            expect(evaluateRTPCCurve(0, curve)).toBe(0);
        });

        it('should clamp to last point if input is >= max x', () => {
            expect(evaluateRTPCCurve(150, curve)).toBe(1);
            expect(evaluateRTPCCurve(100, curve)).toBe(1);
        });

        it('should interpolate linearly between points', () => {
            expect(evaluateRTPCCurve(50, curve)).toBe(0.5);
            expect(evaluateRTPCCurve(25, curve)).toBe(0.25);
        });

        it('should return 0 as fallback if value falls through (e.g. NaN)', () => {
            expect(evaluateRTPCCurve(Number.NaN, curve)).toBe(0);
        });
    });

    describe('Presets (MathCurvePresetDef)', () => {
        const basePreset = { minX: 0, maxX: 100, minY: 0, maxY: 100 };

        it('should clamp to minY if input is <= minX', () => {
            const preset: MathCurveDefinition = { type: 'linear', ...basePreset };
            expect(evaluateRTPCCurve(-50, preset)).toBe(0);
        });

        it('should clamp to maxY if input is >= maxX', () => {
            const preset: MathCurveDefinition = { type: 'linear', ...basePreset };
            expect(evaluateRTPCCurve(150, preset)).toBe(100);
        });

        it('should evaluate linear preset', () => {
            const preset: MathCurveDefinition = { type: 'linear', ...basePreset };
            expect(evaluateRTPCCurve(50, preset)).toBe(50); // t = 0.5
        });

        it('should evaluate exponential preset', () => {
            const preset: MathCurveDefinition = { type: 'exponential', ...basePreset };
            // t = 0.5 -> eased = 0.5^2 = 0.25 -> 25
            expect(evaluateRTPCCurve(50, preset)).toBe(25);
        });

        it('should evaluate s-curve preset', () => {
            const preset: MathCurveDefinition = { type: 's-curve', ...basePreset };
            // t = 0.5 -> eased = 0.5 * 0.5 * (3 - 1) = 0.5
            expect(evaluateRTPCCurve(50, preset)).toBe(50);

            // t = 0.2 -> eased = 0.04 * 2.6 = 0.104
            expect(evaluateRTPCCurve(20, preset)).toBeCloseTo(10.4);
        });

        it('should evaluate logarithmic preset', () => {
            const preset: MathCurveDefinition = { type: 'logarithmic', ...basePreset };
            // t = 0.5 -> eased = Math.log10(1 + 4.5) = Math.log10(5.5) = ~0.74
            expect(evaluateRTPCCurve(50, preset)).toBeCloseTo(74.036);
        });
    });
});
