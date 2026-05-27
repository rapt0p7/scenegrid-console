/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D

import { describe, it, expect, vi, beforeEach } from 'vitest';
import SmartLoopTransitionPolicy from '@domain/Orchestration/SmartLoopTransitionPolicy.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISmartLoopSoundConfig, IMagnetConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { RegionId, GameParamId, BusId } from '@shared/Types/Branded.js';

describe('SmartLoopTransitionPolicy (Magnet Regions)', () => {
    let mockRtpcAdapter: any;
    let policy: SmartLoopTransitionPolicy;

    beforeEach(() => {
        mockRtpcAdapter = {
            getValue: vi.fn(),
            setValue: vi.fn(),
            configureParam: vi.fn()
        } as unknown as IRTPCAdapter;

        policy = new SmartLoopTransitionPolicy(mockRtpcAdapter);
    });

    const createConfig = (magnets?: IMagnetConfig[]): ISmartLoopSoundConfig => ({
        busId: 'master' as BusId,
        smartLoop: {
            regions: {
                ['intro' as RegionId]: [0, 100],
                ['main' as RegionId]: [100, 200],
                ['outro' as RegionId]: [200, 300]
            },
            magnets
        }
    });

    it('should return null if there are no magnets in the config', () => {
        const config = createConfig();
        const result = policy.evaluate(config, 'main' as RegionId);
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

        const result = policy.evaluate(config, 'main' as RegionId);
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
        const result = policy.evaluate(config, 'main' as RegionId);

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
            const result = policy.evaluate(config, 'main' as RegionId);

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
            runOperatorTest('???' as any, 50, 40, false);
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

        const result = policy.evaluate(config, 'main' as RegionId);

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
                crossfadeDuration: 500,
                tailDurationMs: 1000,
                condition: { param: 'time' as GameParamId, operator: '==', value: 0 }
            }
        ]);

        mockRtpcAdapter.getValue.mockReturnValue(0);
        const result = policy.evaluate(config, 'main' as RegionId);

        expect(result).toEqual({
            targetRegion: 'outro',
            transitionRegionName: 'drum_fill',
            options: {
                quantize: 'NextBeat',
                crossfadeDuration: 500,
                tailDurationMs: 1000,
                interruptable: true
            }
        });
    });
});
