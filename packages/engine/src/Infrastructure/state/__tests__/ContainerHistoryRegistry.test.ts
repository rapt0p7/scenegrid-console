// noinspection D
import { describe, it, expect, beforeEach } from 'vitest';

import { ContainerHistoryRegistry } from '@infrastructure/state/ContainerHistoryRegistry.js';

import type { SoundId } from '@scene-grid/shared';

describe('ContainerHistoryRegistry', () => {
    let registry: ContainerHistoryRegistry;

    beforeEach(() => {
        registry = new ContainerHistoryRegistry();
    });

    it('should return default state with lastPlayedIndex -1 for unknown container', () => {
        const state = registry.getHistory('unknown_container' as SoundId);
        expect(state).toEqual({ lastPlayedIndex: -1 });
    });

    it('should store and retrieve the state for a specific container', () => {
        registry.updateHistory('container_A' as SoundId, { lastPlayedIndex: 2 });
        const state = registry.getHistory('container_A' as SoundId);
        expect(state).toEqual({ lastPlayedIndex: 2 });
    });

    it('should isolate states between different containers', () => {
        registry.updateHistory('container_A' as SoundId, { lastPlayedIndex: 1 });
        registry.updateHistory('container_B' as SoundId, { lastPlayedIndex: 5 });

        expect(registry.getHistory('container_A' as SoundId)).toEqual({ lastPlayedIndex: 1 });
        expect(registry.getHistory('container_B' as SoundId)).toEqual({ lastPlayedIndex: 5 });
    });

    it('should clear all states when clear() is called', () => {
        registry.updateHistory('container_A' as SoundId, { lastPlayedIndex: 1 });
        registry.clear();

        const state = registry.getHistory('container_A' as SoundId);

        expect(state).toEqual({ lastPlayedIndex: -1 });
    });
});
