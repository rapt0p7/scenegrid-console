/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, beforeEach } from 'vitest';

import { SwitchHistoryRegistry } from '@infrastructure/state/SwitchHistoryRegistry.js';

import type { ISwitchPlaybackState } from '@domain/Managers/Ports/ISwitchPlaybackState.js';
import type { SoundId } from '@scene-grid/shared';

describe('SwitchHistoryRegistry', () => {
    let registry: SwitchHistoryRegistry;

    beforeEach(() => {
        registry = new SwitchHistoryRegistry();
    });

    it('should return undefined when requesting history for an unknown switchId', () => {
        const result = registry.getHistory('unknown_switch' as SoundId);
        expect(result).toBeUndefined();
    });

    it('should store and retrieve history for a specific switchId', () => {
        const switchId = 'surface_switch' as SoundId;
        const state: ISwitchPlaybackState = { currentSwitchKey: 'wood' };

        registry.updateHistory(switchId, state);

        const result = registry.getHistory(switchId);
        expect(result).toEqual(state);
        expect(result).toBe(state);
    });

    it('should overwrite existing history when updateHistory is called with the same switchId', () => {
        const switchId = 'engine_switch' as SoundId;
        const initialState: ISwitchPlaybackState = { currentSwitchKey: 1 };
        const newState: ISwitchPlaybackState = { currentSwitchKey: 2 };

        registry.updateHistory(switchId, initialState);
        registry.updateHistory(switchId, newState);

        const result = registry.getHistory(switchId);
        expect(result).toEqual(newState);
    });

    it('should store history independently for different switchIds', () => {
        const switchA = 'switch_a' as SoundId;
        const switchB = 'switch_b' as SoundId;
        const stateA: ISwitchPlaybackState = { currentSwitchKey: 'state_a' };
        const stateB: ISwitchPlaybackState = { currentSwitchKey: 'state_b' };

        registry.updateHistory(switchA, stateA);
        registry.updateHistory(switchB, stateB);

        expect(registry.getHistory(switchA)).toEqual(stateA);
        expect(registry.getHistory(switchB)).toEqual(stateB);
    });

    it('should clear all history when clear() is called', () => {
        const switchId1 = 'switch_1' as SoundId;
        const switchId2 = 'switch_2' as SoundId;

        registry.updateHistory(switchId1, { currentSwitchKey: 10 });
        registry.updateHistory(switchId2, { currentSwitchKey: 20 });

        expect(registry.getHistory(switchId1)).toBeDefined();

        registry.clear();

        expect(registry.getHistory(switchId1)).toBeUndefined();
        expect(registry.getHistory(switchId2)).toBeUndefined();
    });
});
