// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ContainerPlaybackPolicy from '@domain/Managers/ContainerPlaybackPolicy.js';

import type { IContainerSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';

describe('ContainerPlaybackPolicy (Pure Evaluator)', () => {
    let policy: ContainerPlaybackPolicy;

    beforeEach(() => {
        policy = new ContainerPlaybackPolicy();
        vi.spyOn(Math, 'random');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return null if sources array is empty or undefined', () => {
        const config = { isContainer: true, mode: 'sequence', sources: [] } as unknown as IContainerSoundConfig;

        const result = policy.evaluateNext(config);

        expect(result.soundId).toBeNull();
        expect(result.nextState).toEqual({ lastPlayedIndex: -1 });
    });

    it('should always return the single item regardless of mode', () => {
        const config = {
            isContainer: true,
            mode: 'random_no_repeat',
            sources: ['single.wav']
        } as unknown as IContainerSoundConfig;

        const result1 = policy.evaluateNext(config, { lastPlayedIndex: -1 });
        expect(result1.soundId).toBe('single.wav');
        expect(result1.nextState).toEqual({ lastPlayedIndex: 0 });

        const result2 = policy.evaluateNext(config, { lastPlayedIndex: 0 });
        expect(result2.soundId).toBe('single.wav');
        expect(result2.nextState).toEqual({ lastPlayedIndex: 0 });

        expect(Math.random).not.toHaveBeenCalled();
    });

    it('should return items sequentially and loop back to the start (Sequence)', () => {
        const config = {
            isContainer: true,
            mode: 'sequence',
            sources: ['A', 'B', 'C']
        } as unknown as IContainerSoundConfig;

        const result1 = policy.evaluateNext(config);
        expect(result1.soundId).toBe('A');
        expect(result1.nextState).toEqual({ lastPlayedIndex: 0 });

        const result2 = policy.evaluateNext(config, result1.nextState);
        expect(result2.soundId).toBe('B');
        expect(result2.nextState).toEqual({ lastPlayedIndex: 1 });

        const result3 = policy.evaluateNext(config, result2.nextState);
        expect(result3.soundId).toBe('C');
        expect(result3.nextState).toEqual({ lastPlayedIndex: 2 });

        const result4 = policy.evaluateNext(config, result3.nextState);
        expect(result4.soundId).toBe('A');
        expect(result4.nextState).toEqual({ lastPlayedIndex: 0 });
    });

    it('should return items based on Math.random (Random)', () => {
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

    it('should NEVER return the same item twice in a row (Random No Repeat)', () => {
        const config = {
            isContainer: true,
            mode: 'random_no_repeat',
            sources: ['A', 'B', 'C']
        } as unknown as IContainerSoundConfig;

        vi.mocked(Math.random)
            .mockReturnValueOnce(0.1)
            .mockReturnValueOnce(0.1)
            .mockReturnValueOnce(0.1)
            .mockReturnValueOnce(0.5);

        const result = policy.evaluateNext(config, { lastPlayedIndex: 0 });

        expect(result.soundId).toBe('B');
        expect(result.nextState).toEqual({ lastPlayedIndex: 1 });
        expect(Math.random).toHaveBeenCalledTimes(4);
    });
});
