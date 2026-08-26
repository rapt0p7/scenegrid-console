import type { IBaseSoundConfig, IPlayOptions } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IPRNG, Milliseconds } from '@scene-grid/shared';

import { describe, expect, it, vi } from 'vitest';

import { VariationResolver } from '../VariationResolver.js';

describe('VariationResolver', () => {
    describe('apply', () => {
        it('should preserve options properties when config variation is absent', () => {
            const config: IBaseSoundConfig = { variation: undefined };
            const options: IPlayOptions = { volume: 0.5, rate: 1.5, isLoop: true };
            const prng = createDummyPRNG();

            const result = VariationResolver.apply(config, options, prng);

            expect(result).toEqual({ volume: 0.5, rate: 1.5, isLoop: true });
        });

        it('should preserve untouched options properties when applying variations', () => {
            const config: IBaseSoundConfig = {
                variation: { pitchVar: 0.1 }
            };
            const options: IPlayOptions = { rate: 1.0, isLoop: true };
            const prng = createStubPRNG(0.05);

            const result = VariationResolver.apply(config, options, prng);

            expect(result.isLoop).toBe(true);
        });

        it('should apply pitch variation with negative lower bound and add delta to initial rate', () => {
            const config: IBaseSoundConfig = {
                variation: { pitchVar: 0.2 }
            };
            const options: IPlayOptions = { rate: 1.0 };
            const prng = createSpyPRNG(0.1);

            const result = VariationResolver.apply(config, options, prng);

            expect(prng.nextRange).toHaveBeenCalledWith(-0.2, 0.2);
            expect(result.rate).toBe(1.1);
        });

        it('should correctly modify a custom initial rate instead of resetting to default rate', () => {
            const config: IBaseSoundConfig = {
                variation: { pitchVar: 0.1 }
            };
            const options: IPlayOptions = { rate: 2.0 };
            const prng = createStubPRNG(0.1);

            const result = VariationResolver.apply(config, options, prng);

            expect(result.rate).toBe(2.1);
        });

        it('should apply volume variation with negative lower bound and add delta to initial volume', () => {
            const config: IBaseSoundConfig = {
                variation: { volumeVar: 0.2 }
            };
            const options: IPlayOptions = { volume: 0.5 };
            const prng = createSpyPRNG(0.2);

            const result = VariationResolver.apply(config, options, prng);

            expect(prng.nextRange).toHaveBeenCalledWith(-0.2, 0.2);
            expect(result.volume).toBe(0.7);
        });

        it('should correctly modify a custom initial volume instead of defaulting or resetting', () => {
            const config: IBaseSoundConfig = {
                variation: { volumeVar: 0.1 }
            };
            const options: IPlayOptions = { volume: 0.5 };
            const prng = createStubPRNG(-0.1);

            const result = VariationResolver.apply(config, options, prng);

            expect(result.volume).toBe(0.4);
        });

        it('should not alter volume or call volume PRNG when volumeVar is undefined', () => {
            const config: IBaseSoundConfig = {
                variation: { pitchVar: 0.1 }
            };
            const options: IPlayOptions = { volume: 0.8 };
            const prng = createSpyPRNG(0.05);

            const result = VariationResolver.apply(config, options, prng);

            expect(result.volume).toBe(0.8);
            expect(prng.nextRange).toHaveBeenCalledTimes(1);
        });

        it('should not alter seek or call randomOffset PRNG when randomOffset is undefined', () => {
            const config: IBaseSoundConfig = {
                variation: { pitchVar: 0.1 }
            };
            const options: IPlayOptions = { seek: 100 as Milliseconds };
            const prng = createSpyPRNG(0.05);

            const result = VariationResolver.apply(config, options, prng);

            expect(result.seek).toBe(100);
            expect(prng.nextRange).toHaveBeenCalledTimes(1);
        });
    });
});

function createDummyPRNG(): IPRNG {
    return {
        nextRange: vi.fn().mockReturnValue(0)
    } as unknown as IPRNG;
}

function createStubPRNG(returnValue: number): IPRNG {
    return {
        nextRange: () => returnValue
    } as unknown as IPRNG;
}

function createSpyPRNG(returnValue: number): IPRNG {
    return {
        nextRange: vi.fn().mockReturnValue(returnValue)
    } as unknown as IPRNG;
}
