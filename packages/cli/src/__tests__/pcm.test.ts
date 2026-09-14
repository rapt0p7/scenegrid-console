import { describe, it, expect } from 'vitest';

import { calculatePCMSize } from '../pcm.js';

describe('PCM Calculation', () => {
    it('calculates the exact PCM size in MB for stereo 44.1kHz audio', () => {
        // 44100 * 2 channels * 4 bytes = 352800 bytes/sec
        // duration = 1 sec -> 352800 bytes -> 352800 / 1048576 = ~0.3364 MB
        // duration = 42.5 sec -> 352800 * 42.5 = 14994000 bytes -> ~14.3 MB

        const size1 = calculatePCMSize(1, 2, 44100);
        expect(size1).toBeCloseTo(352800 / 1024 / 1024, 4);

        const size42 = calculatePCMSize(42.5, 2, 44100);
        expect(size42).toBeCloseTo((352800 * 42.5) / 1024 / 1024, 4);
    });
});
