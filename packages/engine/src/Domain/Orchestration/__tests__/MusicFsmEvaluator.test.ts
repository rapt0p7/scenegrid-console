import { describe, it, expect } from 'vitest';
import { evaluateEdges } from '../MusicFsmEvaluator.js';
import type { IMusicFSMConfig } from '@domain/Configuration/Ports/IMusicFSMConfig';
import type { GameParamId, MusicStateId, RegionId, SoundId, DeepReadonly, IConditionConfig } from '@scene-grid/shared';

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
            ['globalExit' as MusicStateId]: {
                id: 'globalExit' as MusicStateId,
                soundId: 'none' as SoundId,
                sequencerRegion: 'silence' as RegionId,
                edges: []
            }
        }
    };

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

    it('should prioritize global edges even if local is also true', () => {
        const checker = createChecker({ val: 50, globalTrigger: 1 });
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

    it('should return null if state exists but has no edges', () => {
        const checker = createChecker({});
        const result = evaluateEdges(mockFsmConfig, 'stateB' as MusicStateId, checker);
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
        expect(evaluateEdges(complexConfig, 'stateA' as MusicStateId, createChecker({ a: 1, b: 1 }))?.targetState).toBe(
            'stateB'
        );
    });
});
