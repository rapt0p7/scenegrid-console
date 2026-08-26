import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, it } from 'vitest';

import RamQuotaRule from '../RamQuotaRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('RamQuotaRule', () => {
    describe('validate', () => {
        it('should return cleanly without errors when manifest is undefined (Line 11)', () => {
            const rule = new RamQuotaRule();
            const context = createStubContext({});
            // @ts-expect-error Rewriting for test
            context.config.manifest = undefined as any;

            expect(() => {
                rule.validate(context);
            }).not.toThrow();
            expect(context.getErrors()).toHaveLength(0);
            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should fallback to 50 MB default quota when ramQuotaMb is omitted (Line 13)', () => {
            const rule = new RamQuotaRule();
            const context = createStubContext({});

            // @ts-expect-error Rewriting for test
            context.config.ramQuotaMb = undefined as any;
            // @ts-expect-error Rewriting for test
            context.config.precalculatedSizes = {};

            const manifest: Record<string, any> = {};
            for (let i = 0; i < 11; i++) {
                manifest[`sound_${i}`] = { url: `audio_${i}.ogg`, priority: 'high' };
            }
            // @ts-expect-error Rewriting for test
            context.config.manifest = manifest as any;

            rule.validate(context);

            expect(context.getErrors()).toContain(
                'RAM Quota Breach: High-priority sounds consume 55.0 MB, which exceeds the total engine quota of 50 MB. The engine cannot guarantee playback stability.'
            );
        });

        it('should report verbatim error message when total high priority exceeds quota (Lines 34, 36-38)', () => {
            const rule = new RamQuotaRule();
            const context = createStubContext({});

            // @ts-expect-error Rewriting for test
            context.config.ramQuotaMb = 10;
            // @ts-expect-error Rewriting for test
            context.config.precalculatedSizes = {
                'sound1.ogg': 6.0,
                'sound2.ogg': 5.5
            };
            // @ts-expect-error Rewriting for test
            context.config.manifest = {
                s1: { url: 'sound1.ogg', priority: 'high' } as any,
                s2: { url: 'sound2.ogg', priority: 'high' } as any
            };

            rule.validate(context);

            expect(context.getErrors()).toEqual([
                'RAM Quota Breach: High-priority sounds consume 11.5 MB, which exceeds the total engine quota of 10 MB. The engine cannot guarantee playback stability.'
            ]);
        });

        it('should use precalculated size instead of fallback when available (Line 20)', () => {
            const rule = new RamQuotaRule();
            const context = createStubContext({
                ramQuotaMb: 3,
                precalculatedSizes: {
                    'audio/small.ogg': 2.0
                },
                manifest: {
                    small_sound: { url: 'audio/small.ogg', priority: 'high' } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should only accumulate high priority sounds and ignore low/normal priority (Lines 22 & 23)', () => {
            const rule = new RamQuotaRule();
            const context = createStubContext({
                ramQuotaMb: 10,
                precalculatedSizes: {
                    'high.ogg': 4.0,
                    'low.ogg': 20.0
                },
                manifest: {
                    high_sound: { url: 'high.ogg', priority: 'high' } as any,
                    low_sound: { url: 'low.ogg', priority: 'low' } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should not report quota breach when total high priority equals ramQuotaMb exactly (Line 34)', () => {
            const rule = new RamQuotaRule();
            const context = createStubContext({
                ramQuotaMb: 10,
                precalculatedSizes: {
                    'sound1.ogg': 5.0,
                    'sound2.ogg': 5.0
                },
                manifest: {
                    s1: { url: 'sound1.ogg', priority: 'high' } as any,
                    s2: { url: 'sound2.ogg', priority: 'high' } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should not warn when asset size is exactly 15.0 MB or less (Line 26)', () => {
            const rule = new RamQuotaRule();
            const context = createStubContext({
                precalculatedSizes: {
                    'audio/exact15.ogg': 15.0,
                    'audio/small.ogg': 5.0
                },
                manifest: {
                    exact_15: { url: 'audio/exact15.ogg' } as any,
                    small_sound: { url: 'audio/small.ogg' } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toHaveLength(0);
        });

        it('should warn with verbatim message and primary URL when asset exceeds 15.0 MB (Lines 26, 28, 29)', () => {
            const rule = new RamQuotaRule();
            const context = createStubContext({
                precalculatedSizes: {
                    'audio/long_music.ogg': 18.5
                },
                manifest: {
                    bgm_main: {
                        url: ['audio/long_music.ogg', 'audio/long_music.m4a']
                    } as any
                }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            rule.validate(context);

            expect(context.getWarnings()).toEqual([
                "Asset 'bgm_main' (audio/long_music.ogg) is ~18.5 MB. Consider moving this to the Hybrid Streaming Player."
            ]);
        });
    });
});
