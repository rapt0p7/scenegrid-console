import { describe, it, expect, vi } from 'vitest';

import { SeededPRNG } from '../SeededPRNG.js';

describe('SeededPRNG - Constructor', () => {
    it('should fallback to state 1 if seed is 0 (Line 10)', () => {
        const prng = new SeededPRNG(0);

        expect(prng.next()).toBe(1015568748 / 4294967296);
    });

    it('should initialize state with provided non-zero seed (Lines 9-10)', () => {
        const prng = new SeededPRNG(123);
        expect(prng.next()).toBe(1218640798 / 4294967296);
    });
});

describe('SeededPRNG - next() core algorithm', () => {
    it('should correctly apply LCG multiplier, increment, and divisor (Lines 15-17)', () => {
        const prng = new SeededPRNG(1);
        const result = prng.next();

        expect(result).toBe(1015568748 / 4294967296);
    });
});

describe('SeededPRNG - nextRange()', () => {
    it('should correctly scale and interpolate values based on min and max (Line 21)', () => {
        const prng = new SeededPRNG(1);

        const nextSpy = vi.spyOn(prng, 'next').mockReturnValue(0.25);

        const result = prng.nextRange(10, 50);

        expect(result).toBe(20);

        expect(nextSpy).toHaveBeenCalledTimes(1);
    });
});
