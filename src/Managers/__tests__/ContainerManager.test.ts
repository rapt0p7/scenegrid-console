import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import ContainerManager from '../ContainerManager';

import type { IContainerSoundConfig } from '../../interfaces/ISoundConfig';

describe('ContainerManager', () => {
    let manager: ContainerManager;

    beforeEach(() => {
        manager = new ContainerManager();
        vi.spyOn(Math, 'random');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should return null if sources array is empty or undefined', () => {
        const config = { isContainer: true, mode: 'sequence', sources: [] } as unknown as IContainerSoundConfig;
        expect(manager.getNextSource('test_1', config)).toBeNull();
    });

    it('should always return the single item regardless of mode', () => {
        const config = {
            isContainer: true,
            mode: 'random_no_repeat',
            sources: ['single.wav']
        } as unknown as IContainerSoundConfig;

        expect(manager.getNextSource('test_2', config)).toBe('single.wav');
        expect(manager.getNextSource('test_2', config)).toBe('single.wav');

        expect(Math.random).not.toHaveBeenCalled();
    });

    it('should return items sequentially and loop back to the start (Sequence)', () => {
        const config = {
            isContainer: true,
            mode: 'sequence',
            sources: ['A', 'B', 'C']
        } as unknown as IContainerSoundConfig;

        expect(manager.getNextSource('seq_1', config)).toBe('A'); // Изначально lastIndex = -1, ( -1 + 1 ) % 3 = 0
        expect(manager.getNextSource('seq_1', config)).toBe('B'); // (0 + 1) % 3 = 1
        expect(manager.getNextSource('seq_1', config)).toBe('C'); // (1 + 1) % 3 = 2
        expect(manager.getNextSource('seq_1', config)).toBe('A'); // (2 + 1) % 3 = 0
    });

    it('should return items based on Math.random (Random)', () => {
        const config = {
            isContainer: true,
            mode: 'random',
            sources: ['A', 'B', 'C']
        } as unknown as IContainerSoundConfig;

        vi.mocked(Math.random).mockReturnValueOnce(0.1).mockReturnValueOnce(0.9);

        expect(manager.getNextSource('rnd_1', config)).toBe('A');
        expect(manager.getNextSource('rnd_1', config)).toBe('C');
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

        expect(manager.getNextSource('no_rep_1', config)).toBe('A');

        expect(manager.getNextSource('no_rep_1', config)).toBe('B');

        expect(Math.random).toHaveBeenCalledTimes(4);
    });

    it('should isolate states between different containers', () => {
        const config = { isContainer: true, mode: 'sequence', sources: ['A', 'B'] } as unknown as IContainerSoundConfig;

        expect(manager.getNextSource('container_A', config)).toBe('A');
        expect(manager.getNextSource('container_B', config)).toBe('A');
        expect(manager.getNextSource('container_A', config)).toBe('B');
    });

    it('should reset state correctly', () => {
        const config = { isContainer: true, mode: 'sequence', sources: ['A', 'B'] } as unknown as IContainerSoundConfig;

        expect(manager.getNextSource('seq_reset', config)).toBe('A');

        manager.reset('seq_reset');

        expect(manager.getNextSource('seq_reset', config)).toBe('A');

        manager.getNextSource('seq_reset', config);
        manager.getNextSource('another', config);
        manager.reset();

        expect(manager.getNextSource('seq_reset', config)).toBe('A');
        expect(manager.getNextSource('another', config)).toBe('A');
    });
});
