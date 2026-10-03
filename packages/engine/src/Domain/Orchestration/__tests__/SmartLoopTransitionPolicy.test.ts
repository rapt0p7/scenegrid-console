// noinspection D

import type { ISmartLoopSoundConfig, IMagnetConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { RegionId, GameParamId, BusId, Milliseconds, Samples } from '@scene-grid/shared';

import SmartLoopTransitionPolicy from '@domain/Orchestration/SmartLoopTransitionPolicy.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('SmartLoopTransitionPolicy (Magnet Regions)', () => {
    let mockRtpcAdapter: any;
    let policy: SmartLoopTransitionPolicy;

    beforeEach(() => {
        mockRtpcAdapter = {
            getValue: vi.fn(),
            setValue: vi.fn(),
            configureParam: vi.fn()
        };

        policy = new SmartLoopTransitionPolicy(mockRtpcAdapter);
    });

    const createConfig = (magnets?: IMagnetConfig[]): ISmartLoopSoundConfig => ({
        busId: 'master' as BusId,
        smartLoop: {
            regions: {
                ['intro' as RegionId]: [0 as Samples, 100 as Samples],
                ['main' as RegionId]: [100 as Samples, 200 as Samples],
                ['outro' as RegionId]: [200 as Samples, 300 as Samples]
            },
            magnets
        }
    });

    it('should return null if there are no magnets in the config', () => {
        const config = createConfig();
        const result = policy.evaluate(config, 'main' as RegionId, []);
        expect(result).toBeNull();
    });

    it('should return null if none of the magnets belong to the CURRENT region', () => {
        const config = createConfig([
            {
                region: 'intro' as RegionId,
                targetRegion: 'main' as RegionId,
                quantize: 'NextBar',
                condition: { param: 'health' as GameParamId, operator: '<', value: 50 }
            }
        ]);

        const result = policy.evaluate(config, 'main' as RegionId, []);
        expect(result).toBeNull();
        expect(mockRtpcAdapter.getValue).not.toHaveBeenCalled();
    });

    it('should return null and prevent infinite loops if targetRegion is the same as currentRegion', () => {
        const config = createConfig([
            {
                region: 'main' as RegionId,
                targetRegion: 'main' as RegionId,
                quantize: 'NextBar',
                condition: { param: 'health' as GameParamId, operator: '<', value: 50 }
            }
        ]);

        mockRtpcAdapter.getValue.mockReturnValue(10);
        const result = policy.evaluate(config, 'main' as RegionId, []);

        expect(result).toBeNull();
    });

    describe('Mathematical Condition Operators', () => {
        const runOperatorTest = (
            operator: string,
            currentValue: number,
            targetValue: number,
            shouldTrigger: boolean
        ) => {
            const config = createConfig([
                {
                    region: 'main' as RegionId,
                    targetRegion: 'outro' as RegionId,
                    quantize: 'Immediate',
                    condition: { param: 'boss_hp' as GameParamId, operator: operator as any, value: targetValue }
                }
            ]);

            mockRtpcAdapter.getValue.mockReturnValue(currentValue);
            const result = policy.evaluate(config, 'main' as RegionId, []);

            if (shouldTrigger) {
                expect(result).not.toBeNull();
                expect(result?.targetRegion).toBe('outro');
            } else {
                expect(result).toBeNull();
            }
        };

        it('should correctly evaluate ">" operator', () => {
            runOperatorTest('>', 50, 40, true);
            runOperatorTest('>', 40, 50, false);
            runOperatorTest('>', 50, 50, false);
        });

        it('should correctly evaluate "<" operator', () => {
            runOperatorTest('<', 30, 40, true);
            runOperatorTest('<', 50, 40, false);
            runOperatorTest('<', 40, 40, false);
        });

        it('should correctly evaluate "==" operator', () => {
            runOperatorTest('==', 50, 50, true);
            runOperatorTest('==', 50, 40, false);
        });

        it('should correctly evaluate ">=" operator', () => {
            runOperatorTest('>=', 50, 40, true);
            runOperatorTest('>=', 50, 50, true);
            runOperatorTest('>=', 40, 50, false);
        });

        it('should correctly evaluate "<=" operator', () => {
            runOperatorTest('<=', 40, 50, true);
            runOperatorTest('<=', 50, 50, true);
            runOperatorTest('<=', 60, 50, false);
        });

        it('should ignore unknown operators', () => {
            runOperatorTest('???', 50, 40, false);
        });
    });

    describe('Hysteresis (Schmitt Trigger)', () => {
        it('should respect hysteresis bounds and update magnetStates array (Zero-Allocation approach)', () => {
            const config = createConfig([
                {
                    region: 'main' as RegionId,
                    targetRegion: 'outro' as RegionId,
                    quantize: 'Immediate',
                    condition: {
                        param: 'intensity' as GameParamId,
                        operator: '>',
                        value: 50,
                        hysteresis: 5
                    }
                }
            ]);

            const magnetStates: boolean[] = [];

            mockRtpcAdapter.getValue.mockReturnValue(52);
            let result = policy.evaluate(config, 'main' as RegionId, magnetStates);
            expect(result).toBeNull();
            expect(magnetStates[0]).toBe(false);

            mockRtpcAdapter.getValue.mockReturnValue(56);
            result = policy.evaluate(config, 'main' as RegionId, magnetStates);
            expect(result).not.toBeNull();
            expect(magnetStates[0]).toBe(true);

            mockRtpcAdapter.getValue.mockReturnValue(48);
            result = policy.evaluate(config, 'main' as RegionId, magnetStates);
            expect(result).not.toBeNull();
            expect(magnetStates[0]).toBe(true);

            mockRtpcAdapter.getValue.mockReturnValue(44);
            result = policy.evaluate(config, 'main' as RegionId, magnetStates);
            expect(result).toBeNull();
            expect(magnetStates[0]).toBe(false);
        });
    });

    it('should return the FIRST matching magnet if multiple are valid (Priority: top to bottom)', () => {
        const config = createConfig([
            {
                region: 'main' as RegionId,
                targetRegion: 'outro' as RegionId,
                quantize: 'NextBar',
                condition: { param: 'intensity' as GameParamId, operator: '>', value: 50 }
            },
            {
                region: 'main' as RegionId,
                targetRegion: 'intro' as RegionId,
                quantize: 'Immediate',
                condition: { param: 'intensity' as GameParamId, operator: '>', value: 10 }
            }
        ]);

        mockRtpcAdapter.getValue.mockReturnValue(80);

        const result = policy.evaluate(config, 'main' as RegionId, []);

        expect(result).not.toBeNull();
        expect(result?.targetRegion).toBe('outro');
    });

    it('should correctly map all transition options to the decision payload', () => {
        const config = createConfig([
            {
                region: 'main' as RegionId,
                targetRegion: 'outro' as RegionId,
                quantize: 'NextBeat',
                transitionRegionName: 'drum_fill' as RegionId,
                crossfadeDuration: 500 as Milliseconds,
                tailDuration: 1000 as Milliseconds,
                condition: { param: 'time' as GameParamId, operator: '==', value: 0 }
            }
        ]);

        mockRtpcAdapter.getValue.mockReturnValue(0);
        const result = policy.evaluate(config, 'main' as RegionId, []);

        expect(result).toEqual({
            targetRegion: 'outro',
            transitionRegionName: 'drum_fill',
            options: {
                quantize: 'NextBeat',
                crossfadeDuration: 500,
                tailDuration: 1000,
                interruptable: true
            },
            trace: {
                actualValue: 0,
                hysteresisDeadZone: undefined,
                operator: '==',
                param: 'time',
                passed: true,
                threshold: 0
            }
        });
    });
});
