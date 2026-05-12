// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ContainerPlaybackPolicy from '@domain/Managers/ContainerPlaybackPolicy.js';

import type { IContainerSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';

describe('ContainerPlaybackPolicy (Pure Evaluator with Weights & History)', () => {
    let policy: ContainerPlaybackPolicy;

    beforeEach(() => {
        policy = new ContainerPlaybackPolicy();
        vi.spyOn(Math, 'random');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Edge Cases & Fallbacks', () => {
        it('should return null if sources array is empty or undefined', () => {
            const config = { isContainer: true, mode: 'sequence', sources: [] } as unknown as IContainerSoundConfig;

            const result = policy.evaluateNext(config);

            expect(result.soundId).toBeNull();
            expect(result.nextState).toEqual({ lastPlayedIndex: -1 });
        });

        it('should always return the single item regardless of mode and update history', () => {
            const config = {
                isContainer: true,
                mode: 'random_no_repeat',
                sources: ['single.wav']
            } as unknown as IContainerSoundConfig;

            const result1 = policy.evaluateNext(config);
            expect(result1.soundId).toBe('single.wav');
            expect(result1.nextState).toEqual({ lastPlayedIndex: 0, recentHistory: [0] });

            const result2 = policy.evaluateNext(config, result1.nextState);
            expect(result2.soundId).toBe('single.wav');
            expect(result2.nextState).toEqual({ lastPlayedIndex: 0, recentHistory: [0, 0] });

            expect(Math.random).not.toHaveBeenCalled();
        });

        it('should trim recentHistory to exactly 2 elements to prevent memory leaks', () => {
            const config = {
                isContainer: true,
                mode: 'sequence',
                sources: ['A', 'B', 'C', 'D']
            } as unknown as IContainerSoundConfig;

            const result = policy.evaluateNext(config, { lastPlayedIndex: 2, recentHistory: [2, 1] });

            expect(result.nextState.recentHistory).toEqual([3, 2]);
        });
    });

    describe('Sequence Mode', () => {
        it('should return items sequentially and loop back to the start, tracking recentHistory', () => {
            const config = {
                isContainer: true,
                mode: 'sequence',
                sources: ['A', 'B', 'C']
            } as unknown as IContainerSoundConfig;

            const result1 = policy.evaluateNext(config);
            expect(result1.soundId).toBe('A');
            expect(result1.nextState).toEqual({ lastPlayedIndex: 0, recentHistory: [0] });

            const result2 = policy.evaluateNext(config, result1.nextState);
            expect(result2.soundId).toBe('B');
            expect(result2.nextState).toEqual({ lastPlayedIndex: 1, recentHistory: [1, 0] });

            const result3 = policy.evaluateNext(config, result2.nextState);
            expect(result3.soundId).toBe('C');
            expect(result3.nextState).toEqual({ lastPlayedIndex: 2, recentHistory: [2, 1] });

            const result4 = policy.evaluateNext(config, result3.nextState);
            expect(result4.soundId).toBe('A');
            expect(result4.nextState).toEqual({ lastPlayedIndex: 0, recentHistory: [0, 2] });
        });
    });

    describe('Random Mode (Weighted Math)', () => {
        it('should resolve uniform random values if no weights are provided (strings only)', () => {
            const config = {
                isContainer: true,
                mode: 'random',
                sources: ['A', 'B', 'C']
            } as unknown as IContainerSoundConfig;

            vi.mocked(Math.random).mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);

            const result1 = policy.evaluateNext(config);
            expect(result1.soundId).toBe('A');

            const result2 = policy.evaluateNext(config);
            expect(result2.soundId).toBe('C');
        });

        it('should correctly respect explicit weights when objects are passed', () => {
            const config = {
                isContainer: true,
                mode: 'random',
                sources: ['common.wav', { id: 'rare.wav', weight: 4 }]
            } as unknown as IContainerSoundConfig;

            vi.mocked(Math.random).mockReturnValueOnce(0.1).mockReturnValueOnce(0.5);

            const result1 = policy.evaluateNext(config);
            expect(result1.soundId).toBe('common.wav');

            const result2 = policy.evaluateNext(config);
            expect(result2.soundId).toBe('rare.wav');
        });
    });

    describe('Random No Repeat Mode', () => {
        it('should NEVER return an item if it exists in the recentHistory', () => {
            const config = {
                isContainer: true,
                mode: 'random_no_repeat',
                sources: ['A', 'B', 'C']
            } as unknown as IContainerSoundConfig;

            const currentState = { lastPlayedIndex: 0, recentHistory: [0] };

            vi.mocked(Math.random).mockReturnValueOnce(0.1).mockReturnValueOnce(0.2).mockReturnValueOnce(0.5);

            const result = policy.evaluateNext(config, currentState);

            expect(result.soundId).toBe('B');
            expect(result.nextState).toEqual({ lastPlayedIndex: 1, recentHistory: [1, 0] });

            expect(Math.random).toHaveBeenCalledTimes(3);
        });
    });
});
