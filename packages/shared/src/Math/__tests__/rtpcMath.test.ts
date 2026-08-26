// oxlint-disable import/no-named-as-default-member
// noinspection D

import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

import type { MathCurveDefinition } from '../MathCurve';

import { evaluateRTPCCurve } from '../rtpcMath.js';

describe('evaluateRTPCCurve', () => {
    const validFloat = fc.float({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 });

    const presetArb = fc
        .record({
            type: fc.constantFrom('linear', 'logarithmic', 'exponential', 's-curve'),
            minX: validFloat,
            maxX: validFloat,
            minY: validFloat,
            maxY: validFloat
        })
        .map(preset => {
            // Гарантируем, что minX всегда <= maxX
            if (preset.minX > preset.maxX) {
                const temp = preset.minX;
                preset.minX = preset.maxX;
                preset.maxX = temp;
            }
            return preset;
        });

    describe('Edge Cases (PBT)', () => {
        test.prop([fc.float({ noNaN: true })])('should return 0 if curve is undefined or null', val => {
            expect(evaluateRTPCCurve(val, null as any)).toBe(0);
            expect(evaluateRTPCCurve(val, undefined as any)).toBe(0);
        });
    });

    describe('Piecewise Linear (Array of points) (PBT)', () => {
        const pointArb = fc.record({ x: validFloat, y: validFloat });
        // oxlint-disable-next-line unicorn/no-array-sort
        const curveArb = fc.array(pointArb, { minLength: 2 }).map(arr => [...arr].sort((a, b) => a.x - b.x));

        test.prop([validFloat])('should return 0 for an empty array regardless of input', val => {
            expect(evaluateRTPCCurve(val, [])).toBe(0);
        });

        test.prop([validFloat, pointArb])(
            'should return the only point y-value for an array with 1 point',
            (val, pt) => {
                expect(evaluateRTPCCurve(val, [pt])).toBe(pt.y);
            }
        );

        test.prop([curveArb])('should clamp to first point if input is <= min x', curve => {
            const firstPoint = curve[0];
            const input = firstPoint.x - Math.abs(firstPoint.x * 0.1) - 1;
            expect(evaluateRTPCCurve(input, curve)).toBe(firstPoint.y);
            expect(evaluateRTPCCurve(firstPoint.x, curve)).toBe(firstPoint.y);
        });

        test.prop([curveArb])('should clamp to last point if input is >= max x', curve => {
            const lastPoint = curve.at(-1);
            const input = lastPoint.x + Math.abs(lastPoint.x * 0.1) + 1;
            expect(evaluateRTPCCurve(input, curve)).toBe(lastPoint.y);
            expect(evaluateRTPCCurve(lastPoint.x, curve)).toBe(lastPoint.y);
        });

        test.prop([pointArb, pointArb])(
            'should interpolate linearly exactly in the middle of any two points',
            (p1, p2) => {
                const left = p1.x < p2.x ? p1 : p2;
                const right = p1.x < p2.x ? p2 : p1;

                fc.pre(left.x !== right.x);

                const midX = left.x + (right.x - left.x) / 2;
                const expectedY = left.y + (right.y - left.y) / 2;

                expect(evaluateRTPCCurve(midX, [left, right])).toBeCloseTo(expectedY, 4);
            }
        );
    });

    describe('Presets (MathCurvePresetDef) (PBT)', () => {
        test.prop([presetArb])('should strictly clamp to minY if input is <= minX', preset => {
            const { minX, minY } = preset as any;
            const input = minX - Math.abs(minX * 0.1) - 1;
            expect(evaluateRTPCCurve(input, preset)).toBe(minY);
            expect(evaluateRTPCCurve(minX, preset)).toBe(minY);
        });

        test.prop([presetArb])('should strictly clamp to maxY if input is >= maxX', preset => {
            const { minX, maxX, maxY } = preset as any;
            fc.pre(minX !== maxX);
            const input = maxX + Math.abs(maxX * 0.1) + 1;
            expect(evaluateRTPCCurve(input, preset)).toBe(maxY);
            expect(evaluateRTPCCurve(maxX, preset)).toBe(maxY);
        });

        test.prop([presetArb])('should evaluate boundaries precisely for all curve types', preset => {
            const { minX, maxX, minY, maxY } = preset as any;
            fc.pre(minX !== maxX);

            expect(evaluateRTPCCurve(minX, preset)).toBeCloseTo(minY, 4);
            expect(evaluateRTPCCurve(maxX, preset)).toBeCloseTo(maxY, 4);
        });
    });

    describe('Parametric Curves Interpolation (Math Oracles)', () => {
        const basePreset = { minX: 0, maxX: 100, minY: 0, maxY: 100 };

        test.prop([
            presetArb,
            fc.float({
                min: Math.fround(0.0001),
                max: Math.fround(0.9999),
                noNaN: true
            })
        ])('should confine all curve interpolations within Y boundaries', (preset, t) => {
            const { minX, maxX, minY, maxY } = preset as any;
            fc.pre(minX !== maxX);

            const inputValue = minX + t * (maxX - minX);
            const result = evaluateRTPCCurve(inputValue, preset);

            const expectedMin = Math.min(minY, maxY);
            const expectedMax = Math.max(minY, maxY);

            expect(result).toBeGreaterThanOrEqual(expectedMin);
            expect(result).toBeLessThanOrEqual(expectedMax);
        });

        it('should correctly evaluate logarithmic math', () => {
            const preset: MathCurveDefinition = { type: 'logarithmic', ...basePreset };

            expect(evaluateRTPCCurve(50, preset)).toBeCloseTo(74.03626, 4);
        });

        it('should correctly evaluate exponential math', () => {
            const preset: MathCurveDefinition = { type: 'exponential', ...basePreset };

            expect(evaluateRTPCCurve(50, preset)).toBe(25);
        });

        it('should correctly evaluate s-curve math', () => {
            const preset: MathCurveDefinition = { type: 's-curve', ...basePreset };

            expect(evaluateRTPCCurve(50, preset)).toBe(50);
            expect(evaluateRTPCCurve(20, preset)).toBeCloseTo(10.4, 3);
        });
    });

    describe('Piecewise Curves (Arrays)', () => {
        it('should handle single-point curve correctly (Line 17)', () => {
            const curve: MathCurveDefinition = [{ x: 10, y: 42 }];

            expect(evaluateRTPCCurve(100, curve)).toBe(42);
            expect(evaluateRTPCCurve(0, curve)).toBe(42);
        });

        it('should correctly sort unsorted points before evaluation (Line 20)', () => {
            const curve: MathCurveDefinition = [
                { x: 20, y: 200 },
                { x: 0, y: 0 },
                { x: 10, y: 100 }
            ];

            expect(evaluateRTPCCurve(15, curve)).toBe(150);
        });

        it('should resolve discontinuities properly favoring the first valid segment (Lines 26, 32)', () => {
            const curve: MathCurveDefinition = [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
                { x: 10, y: 100 },
                { x: 20, y: 200 }
            ];

            expect(evaluateRTPCCurve(10, curve)).toBe(10);
        });

        it('should not out-of-bounds loop when input evaluates to false for all conditions (Line 29)', () => {
            const curve: MathCurveDefinition = [
                { x: 0, y: 0 },
                { x: 10, y: 10 }
            ];

            expect(evaluateRTPCCurve(NaN, curve)).toBe(0);
        });

        it('should perfectly bound the segment checks and avoid false positives (Line 32)', () => {
            const curve: MathCurveDefinition = [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
                { x: 20, y: 100 }
            ];

            expect(evaluateRTPCCurve(15, curve)).toBe(55);
        });

        it("should return the only point's Y value for a 1-point curve, even if input is NaN (Line 17)", () => {
            const curve: MathCurveDefinition = [{ x: 10, y: 42 }];

            expect(evaluateRTPCCurve(NaN, curve)).toBe(42);
        });

        it('should strictly prefer the first defined Y when evaluating the exact start of a step function (Line 26)', () => {
            const curve: MathCurveDefinition = [
                { x: 10, y: 100 },
                { x: 10, y: 200 }
            ];

            expect(evaluateRTPCCurve(10, curve)).toBe(100);
        });

        it('should strictly prefer the last defined Y when evaluating the exact end of a step function (Line 27)', () => {
            const curve: MathCurveDefinition = [
                { x: 0, y: 0 },
                { x: 10, y: 100 },
                { x: 10, y: 200 }
            ];

            expect(evaluateRTPCCurve(10, curve)).toBe(200);
        });

        it('should not iterate out of bounds when input fails all segment checks (Line 29)', () => {
            const curve: MathCurveDefinition = [
                { x: 0, y: 0 },
                { x: 10, y: 10 }
            ];

            expect(() => evaluateRTPCCurve(NaN, curve)).not.toThrow();
            expect(evaluateRTPCCurve(NaN, curve)).toBe(0);
        });

        it('should confine interpolation to the correct segment without extrapolating earlier segments (Line 32)', () => {
            const curve: MathCurveDefinition = [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
                { x: 20, y: 100 }
            ];

            expect(evaluateRTPCCurve(15, curve)).toBe(55);
        });
    });

    describe('Parametric Curves (Objects)', () => {
        it('should strictly prefer minY when minX equals maxX (Line 42)', () => {
            const curve: MathCurveDefinition = { type: 'linear', minX: 10, maxX: 10, minY: 100, maxY: 200 };

            expect(evaluateRTPCCurve(10, curve)).toBe(100);
        });

        it('should correctly boundary-clamp Infinity values (Line 43)', () => {
            const curve: MathCurveDefinition = { type: 'linear', minX: 0, maxX: Infinity, minY: 0, maxY: 100 };

            expect(evaluateRTPCCurve(Infinity, curve)).toBe(100);
        });

        it('should compute exact interpolation parameters (t) based on min/max distances (Line 45)', () => {
            const curve: MathCurveDefinition = { type: 'linear', minX: 10, maxX: 30, minY: 0, maxY: 100 };

            expect(evaluateRTPCCurve(15, curve)).toBe(25);
        });

        it('should compute the correct span amplitude in the final output (Line 67)', () => {
            const curve: MathCurveDefinition = { type: 'linear', minX: 0, maxX: 10, minY: 10, maxY: 30 };

            expect(evaluateRTPCCurve(5, curve)).toBe(20);
        });

        it('should correctly process linear curves (Line 49)', () => {
            const curve: MathCurveDefinition = { type: 'linear', minX: 0, maxX: 10, minY: 0, maxY: 100 };

            expect(evaluateRTPCCurve(5, curve)).toBe(50);
        });
    });

    describe('Equivalent Mutant Assassins (Dynamic ValueOf Injection)', () => {
        it('should strictly bounds-check loop limits (Line 29) to prevent undefined access', () => {
            let calls = 0;
            const dynamicInput = {
                valueOf() {
                    calls++;
                    if (calls === 1) return 5;
                    if (calls === 2) return 5;
                    if (calls === 3) return -5;
                    if (calls === 4) return 15;
                    return 15;
                }
            } as unknown as number;

            const curve: MathCurveDefinition = [
                { x: 0, y: 0 },
                { x: 10, y: 10 }
            ];

            expect(() => evaluateRTPCCurve(dynamicInput, curve)).not.toThrow();

            calls = 0;
            expect(evaluateRTPCCurve(dynamicInput, curve)).toBe(0);
        });

        it('should strictly evaluate lower bound of segment (Line 32 - true mutant)', () => {
            let calls = 0;
            const dynamicInput = {
                valueOf() {
                    calls++;
                    if (calls === 1) return 5;
                    if (calls === 2) return 5;
                    if (calls === 3) return 15;
                    if (calls === 4) return 15;
                    if (calls === 5) return 5;
                    if (calls === 6) return 5;
                    if (calls === 7) return 5;
                    return 5;
                }
            } as unknown as number;

            const curve: MathCurveDefinition = [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
                { x: 20, y: 20 }
            ];

            expect(evaluateRTPCCurve(dynamicInput, curve)).toBe(0);
        });

        it('should correctly include segment start boundary (Line 32 - strict greater than mutant)', () => {
            let calls = 0;
            const dynamicInput = {
                valueOf() {
                    calls++;
                    if (calls === 1) return 5;
                    if (calls === 2) return 5;
                    if (calls === 3) return 15;
                    if (calls === 4) return 15;
                    if (calls === 5) return 10;
                    if (calls === 6) return 10;
                    if (calls === 7) return 10;
                    return 10;
                }
            } as unknown as number;

            const curve: MathCurveDefinition = [
                { x: 0, y: 0 },
                { x: 10, y: 10 },
                { x: 20, y: 20 }
            ];

            expect(evaluateRTPCCurve(dynamicInput, curve)).toBe(10);
        });
    });
});
