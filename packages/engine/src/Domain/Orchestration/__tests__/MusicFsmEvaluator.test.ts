// noinspection D

import type { IMusicFSMConfig } from '@domain/Configuration/Ports/IMusicFSMConfig';
import type { GameParamId, MusicStateId, RegionId, SoundId, DeepReadonly, IConditionConfig } from '@scene-grid/shared';

import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, it, expect } from 'vitest';

import { evaluateEdges } from '../MusicFsmEvaluator.js';

const createChecker = (values: Record<string, number>) => (cond: DeepReadonly<IConditionConfig>) => {
    const val = values[cond.param] ?? 0;
    switch (cond.operator) {
        case '==':
            return val === cond.value;
        case '>=':
            return val >= cond.value;
        default:
            return false;
    }
};

describe('MusicFsmEvaluator: evaluateEdges', () => {
    describe('PBT: Condition Evaluation Logic', () => {
        const edgeArb = fc.record({
            targetState: fc.string().map(s => s as MusicStateId),
            conditions: fc.array(
                fc.record({
                    param: fc.string().map(s => s as GameParamId),
                    operator: fc.constantFrom('==' as const, '>=' as const),
                    value: fc.integer()
                })
            ),
            syncRule: fc.constant('Immediate' as const),
            interruptable: fc.boolean()
        });

        test.prop([edgeArb, fc.array(fc.boolean())])(
            'should evaluate to TRUE only if ALL conditions pass, or FALSE if ANY fail',
            (edge, booleanResults) => {
                let evalIndex = 0;
                const mockChecker = () => {
                    return evalIndex < booleanResults.length ? booleanResults[evalIndex++] : true;
                };

                const config: IMusicFSMConfig = {
                    initialState: 'stateA' as MusicStateId,
                    globalEdges: [],
                    states: {
                        ['stateA' as MusicStateId]: {
                            id: 'stateA' as MusicStateId,
                            soundId: 'trackA' as SoundId,
                            sequencerRegion: 'regionA' as RegionId,
                            edges: [edge]
                        }
                    }
                };

                const expectedResult =
                    edge.conditions.length === 0
                        ? true
                        : // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare
                          booleanResults.slice(0, edge.conditions.length).every(b => b === true);

                const result = evaluateEdges(config, 'stateA' as MusicStateId, mockChecker);

                if (expectedResult) {
                    expect(result?.targetState).toBe(edge.targetState);
                } else {
                    expect(result).toBeNull();
                }
            }
        );

        test.prop([edgeArb, edgeArb])(
            'should always prioritize GLOBAL edges over LOCAL edges if both match',
            (globalEdge, localEdge) => {
                const alwaysTrueChecker = () => true;

                const config: IMusicFSMConfig = {
                    initialState: 'stateA' as MusicStateId,
                    globalEdges: [globalEdge],
                    states: {
                        ['stateA' as MusicStateId]: {
                            id: 'stateA' as MusicStateId,
                            soundId: 'trackA' as SoundId,
                            sequencerRegion: 'regionA' as RegionId,
                            edges: [localEdge]
                        }
                    }
                };

                const result = evaluateEdges(config, 'stateA' as MusicStateId, alwaysTrueChecker);

                expect(result?.targetState).toBe(globalEdge.targetState);
            }
        );
    });

    describe('Standard Oracles', () => {
        const mockFsmConfig: IMusicFSMConfig = {
            initialState: 'stateA' as MusicStateId,
            globalEdges: [
                {
                    targetState: 'globalExit' as MusicStateId,
                    conditions: [{ param: 'globalTrigger' as GameParamId, operator: '==', value: 1 }],
                    syncRule: 'Immediate',
                    interruptable: true
                }
            ],
            states: {
                ['stateA' as MusicStateId]: {
                    id: 'stateA' as MusicStateId,
                    soundId: 'trackA' as SoundId,
                    sequencerRegion: 'regionA' as RegionId,
                    edges: [
                        {
                            targetState: 'stateB' as MusicStateId,
                            conditions: [{ param: 'val' as GameParamId, operator: '>=', value: 10 }],
                            syncRule: 'NextBar',
                            interruptable: false
                        }
                    ]
                },
                ['stateB' as MusicStateId]: {
                    id: 'stateB' as MusicStateId,
                    soundId: 'trackB' as SoundId,
                    sequencerRegion: 'regionB' as RegionId,
                    edges: []
                },
                ['stateWithUnconditional' as MusicStateId]: {
                    id: 'stateWithUnconditional' as MusicStateId,
                    soundId: 'trackC' as SoundId,
                    sequencerRegion: 'regionC' as RegionId,
                    edges: [
                        {
                            targetState: 'fallbackState' as MusicStateId,
                            conditions: [],
                            syncRule: 'Immediate',
                            interruptable: false
                        }
                    ]
                },
                ['globalExit' as MusicStateId]: {
                    id: 'globalExit' as MusicStateId,
                    soundId: 'none' as SoundId,
                    sequencerRegion: 'silence' as RegionId,
                    edges: []
                }
            }
        };

        it('should trigger unconditional transition when conditions array is empty (Line 45 Coverage)', () => {
            const checker = createChecker({});
            const result = evaluateEdges(mockFsmConfig, 'stateWithUnconditional' as MusicStateId, checker);

            expect(result?.targetState).toBe('fallbackState');
        });

        it('should return null if no conditions match (local or global)', () => {
            const checker = createChecker({ val: 0, globalTrigger: 0 });
            const result = evaluateEdges(mockFsmConfig, 'stateA' as MusicStateId, checker);
            expect(result).toBeNull();
        });

        it('should return global edge if condition matches', () => {
            const checker = createChecker({ val: 0, globalTrigger: 1 });
            const result = evaluateEdges(mockFsmConfig, 'stateA' as MusicStateId, checker);
            expect(result?.targetState).toBe('globalExit');
        });

        it('should return local edge if only local is true', () => {
            const checker = createChecker({ val: 50, globalTrigger: 0 });
            const result = evaluateEdges(mockFsmConfig, 'stateA' as MusicStateId, checker);
            expect(result?.targetState).toBe('stateB');
        });

        it('should return null if current state does not exist in config', () => {
            const checker = createChecker({});
            const result = evaluateEdges(mockFsmConfig, 'nonExistent' as MusicStateId, checker);
            expect(result).toBeNull();
        });

        it('should match correctly when multiple conditions are provided (AND logic)', () => {
            const complexConfig: IMusicFSMConfig = {
                ...mockFsmConfig,
                states: {
                    ['stateA' as MusicStateId]: {
                        id: 'stateA' as MusicStateId,
                        soundId: 'trackA' as SoundId,
                        sequencerRegion: 'regionA' as RegionId,
                        edges: [
                            {
                                targetState: 'stateB' as MusicStateId,
                                conditions: [
                                    { param: 'a' as GameParamId, operator: '==', value: 1 },
                                    { param: 'b' as GameParamId, operator: '==', value: 1 }
                                ],
                                syncRule: 'Immediate',
                                interruptable: true
                            }
                        ]
                    }
                }
            };

            expect(evaluateEdges(complexConfig, 'stateA' as MusicStateId, createChecker({ a: 1, b: 0 }))).toBeNull();
            expect(
                evaluateEdges(complexConfig, 'stateA' as MusicStateId, createChecker({ a: 1, b: 1 }))?.targetState
            ).toBe('stateB');
        });
    });
});
