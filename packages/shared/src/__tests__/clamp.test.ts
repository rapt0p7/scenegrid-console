import { describe, expect, it } from 'vitest';

import clamp from '../clamp.js';

describe('clamp', () => {
    it('returns the value when it is within the range', () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });

    it('returns min when value is below min', () => {
        expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('returns max when value is above max', () => {
        expect(clamp(15, 0, 10)).toBe(10);
    });

    it('returns min when value equals min', () => {
        expect(clamp(0, 0, 10)).toBe(0);
    });

    it('returns max when value equals max', () => {
        expect(clamp(10, 0, 10)).toBe(10);
    });

    it('works with negative ranges', () => {
        expect(clamp(-5, -10, -1)).toBe(-5);
        expect(clamp(-15, -10, -1)).toBe(-10);
        expect(clamp(0, -10, -1)).toBe(-1);
    });

    it('returns the same value when min and max are equal', () => {
        expect(clamp(5, 10, 10)).toBe(10);
        expect(clamp(15, 10, 10)).toBe(10);
        expect(clamp(5, 10, 10)).toBe(10);
    });

    it('works with floating-point numbers', () => {
        expect(clamp(0.5, 0.1, 0.9)).toBe(0.5);
        expect(clamp(0.05, 0.1, 0.9)).toBe(0.1);
        expect(clamp(0.95, 0.1, 0.9)).toBe(0.9);
    });
});
