import type { IConsistencyCheckerPayload } from '@domain/Validation/Ports/IConsistencyCheckerPayload';

import { describe, expect, it, vi } from 'vitest';

import SmartLoopRule from '../SmartLoopRule.js';
import { createStubContext } from './helpers/createStubContext.js';

describe('SmartLoopRule', () => {
    describe('validate', () => {
        it('should ignore non-smartLoop sounds', () => {
            const rule = new SmartLoopRule();
            const context = createStubContext({});

            rule.validate('sfx', { src: 'audio.ogg' }, context);

            expect(context.getErrors()).toHaveLength(0);
        });

        it('should assert exact schema paths for bpm and crossfade (Lines 13 & 14)', () => {
            const rule = new SmartLoopRule();
            const context = createStubContext({});
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            const smartLoopConfig = {
                smartLoop: {
                    bpm: 128,
                    crossfade: 350,
                    regions: { intro: [0, 1000] as [number, number] }
                }
            };

            rule.validate('bgm_track', smartLoopConfig as any, context);

            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('soundMap.bgm_track.smartLoop.bpm', 128, 'number');
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith('soundMap.bgm_track.smartLoop.crossfade', 350, 'number');
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should assert required non-optional array for region range with exact path (Line 20)', () => {
            const rule = new SmartLoopRule();
            const context = createStubContext({});
            const assertArraySpy = vi.spyOn(context, 'assertArray');

            const smartLoopConfig = {
                smartLoop: {
                    regions: { main_loop: 'not_an_array' as any }
                }
            };

            rule.validate('bgm', smartLoopConfig as any, context);

            expect(assertArraySpy).toHaveBeenCalledWith(
                'soundMap.bgm.smartLoop.regions.main_loop',
                'not_an_array',
                false
            );
            expect(context.getErrors()).toContain(
                'Type Error at "soundMap.bgm.smartLoop.regions.main_loop": expected array, got string'
            );
        });

        it('should reject regions with length < 2 or non-number endSample (Lines 22 & 25)', () => {
            const rule = new SmartLoopRule();
            const context = createStubContext({});

            const smartLoopConfig = {
                smartLoop: {
                    regions: {
                        reg_short: [1000] as any,
                        reg_bad_end: [0, 'invalid_end'] as any
                    }
                }
            };

            rule.validate('bgm', smartLoopConfig as any, context);

            expect(context.getErrors()).toContain(
                'SmartLoop "bgm" region "reg_short" must be an array of 2 to 4 numbers.'
            );
            expect(context.getErrors()).toContain(
                'SmartLoop "bgm" region "reg_bad_end" must be an array of 2 to 4 numbers.'
            );
        });

        it('should reject zero-length regions where startSample equals endSample (Line 30)', () => {
            const rule = new SmartLoopRule();
            const context = createStubContext({});

            const smartLoopConfig = {
                smartLoop: {
                    regions: { reg_zero_len: [1000, 1000] as [number, number] }
                }
            };

            rule.validate('bgm', smartLoopConfig as any, context);

            expect(context.getErrors()).toContain(
                'SmartLoop "bgm" region "reg_zero_len" has invalid range (1000 >= 1000)'
            );
        });

        it('should validate optional array and exact schema paths for magnets (Lines 59, 72-74)', () => {
            const rule = new SmartLoopRule();
            const context = createStubContext({});
            const assertArraySpy = vi.spyOn(context, 'assertArray');
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            const smartLoopConfig = {
                smartLoop: {
                    regions: { r1: [0, 1000] as [number, number] },
                    magnets: [
                        {
                            region: 'r1',
                            targetRegion: 'r1',
                            quantize: 'NextBar',
                            transitionRegionName: 'trans_bridge',
                            crossfadeDuration: 400,
                            tailDuration: 200,
                            condition: { param: 'intensity', operator: '>', value: 5 }
                        }
                    ]
                }
            };

            rule.validate('bgm', smartLoopConfig as any, context);

            expect(assertArraySpy).toHaveBeenCalledWith(
                'soundMap.bgm.smartLoop.magnets',
                smartLoopConfig.smartLoop.magnets,
                true
            );
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                'soundMap.bgm.smartLoop.magnets[0].transitionRegionName',
                'trans_bridge',
                'string'
            );
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                'soundMap.bgm.smartLoop.magnets[0].crossfadeDuration',
                400,
                'number'
            );
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                'soundMap.bgm.smartLoop.magnets[0].tailDuration',
                200,
                'number'
            );
        });

        it('should accept all 3 valid offsetMode values (None, Relative, Inverted) (Line 81)', () => {
            const rule = new SmartLoopRule();
            const modes = ['None', 'Relative', 'Inverted'] as const;

            for (const mode of modes) {
                const context = createStubContext({});
                const smartLoopConfig = {
                    smartLoop: {
                        regions: { r1: [0, 1000] as [number, number] },
                        magnets: [
                            {
                                region: 'r1',
                                targetRegion: 'r1',
                                quantize: 'NextBar',
                                offsetMode: mode,
                                condition: { param: 'p', operator: '==', value: 1 }
                            }
                        ]
                    }
                };

                rule.validate('bgm', smartLoopConfig as any, context);
                expect(context.getErrors()).toHaveLength(0);
            }
        });

        it('should reject invalid offsetMode values with exact error message (Line 81)', () => {
            const rule = new SmartLoopRule();
            const context = createStubContext({});

            const smartLoopConfig = {
                smartLoop: {
                    regions: { r1: [0, 1000] as [number, number] },
                    magnets: [
                        {
                            region: 'r1',
                            targetRegion: 'r1',
                            quantize: 'NextBar',
                            offsetMode: 'InvalidOffsetMode' as any,
                            condition: { param: 'p', operator: '==', value: 1 }
                        }
                    ]
                }
            };

            rule.validate('bgm', smartLoopConfig as any, context);

            expect(context.getErrors()).toContain(
                'SmartLoop "bgm" region "r1" magnet has invalid offsetMode "InvalidOffsetMode". Expected \'None\', \'Relative\', or \'Inverted\'.'
            );
        });

        it('should accept zero hysteresis and assert exact schema path for operator and hysteresis (Lines 105, 110, 113)', () => {
            const rule = new SmartLoopRule();
            const context = createStubContext({
                rtpcManifest: { speed: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);
            const assertRequiredTypeSpy = vi.spyOn(context, 'assertRequiredType');
            const assertOptionalTypeSpy = vi.spyOn(context, 'assertOptionalType');

            const smartLoopConfig = {
                smartLoop: {
                    regions: { r1: [0, 1000] as [number, number] },
                    magnets: [
                        {
                            region: 'r1',
                            targetRegion: 'r1',
                            quantize: 'NextBar',
                            condition: { param: 'speed', operator: '>=', value: 50, hysteresis: 0 }
                        }
                    ]
                }
            };

            rule.validate('bgm', smartLoopConfig as any, context);

            expect(assertRequiredTypeSpy).toHaveBeenCalledWith(
                'soundMap.bgm.smartLoop.magnets[0].condition.operator',
                '>=',
                'string'
            );
            expect(assertOptionalTypeSpy).toHaveBeenCalledWith(
                'soundMap.bgm.smartLoop.magnets[0].condition.hysteresis',
                0,
                'number'
            );
            expect(context.getErrors()).toHaveLength(0);
        });

        it('should reject negative hysteresis (Line 113)', () => {
            const rule = new SmartLoopRule();
            const context = createStubContext({
                rtpcManifest: { speed: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            const smartLoopConfig = {
                smartLoop: {
                    regions: { r1: [0, 1000] as [number, number] },
                    magnets: [
                        {
                            region: 'r1',
                            targetRegion: 'r1',
                            quantize: 'NextBar',
                            condition: { param: 'speed', operator: '>=', value: 50, hysteresis: -0.5 }
                        }
                    ]
                }
            };

            rule.validate('bgm', smartLoopConfig as any, context);

            expect(context.getErrors()).toContain(
                'Hysteresis at "soundMap.bgm.smartLoop.magnets[0].condition.hysteresis" cannot be negative.'
            );
        });

        it('should not error on condition param when rtpcManifest is empty, but error when populated and param is missing (Line 96)', () => {
            const rule = new SmartLoopRule();
            const contextEmpty = createStubContext({ rtpcManifest: {} });
            const contextPopulated = createStubContext({
                rtpcManifest: { known_param: {} as any }
            } as unknown as Partial<IConsistencyCheckerPayload>);

            const smartLoopConfig = {
                smartLoop: {
                    regions: { r1: [0, 1000] as [number, number] },
                    magnets: [
                        {
                            region: 'r1',
                            targetRegion: 'r1',
                            quantize: 'NextBar',
                            condition: { param: 'unknown_param', operator: '==', value: 1 }
                        }
                    ]
                }
            };

            rule.validate('bgm1', smartLoopConfig as any, contextEmpty);
            rule.validate('bgm2', smartLoopConfig as any, contextPopulated);

            expect(contextEmpty.getErrors()).toHaveLength(0);
            expect(contextPopulated.getErrors()).toContain(
                'SmartLoop "bgm2" uses unknown RTPC param "unknown_param" in magnet condition.'
            );
        });
    });
});
