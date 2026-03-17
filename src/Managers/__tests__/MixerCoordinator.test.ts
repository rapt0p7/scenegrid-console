import { describe, it, expect, vi, beforeEach } from 'vitest';

import MixerCoordinator from '../MixerCoordinator';

import type { MixerState } from '../../interfaces/IMixerStateManager';
import type MixerLayerStack from '../MixerLayer';
import type MixerStateManager from '../MixerStateManager';

describe('MixerCoordinator', () => {
    let coordinator: MixerCoordinator;
    let mockLayerStack: any;
    let mockStateManager: any;

    beforeEach(() => {
        mockLayerStack = {
            computeState: vi.fn()
        };

        mockStateManager = {
            applyState: vi.fn().mockResolvedValue(undefined),
            getState: vi.fn()
        };

        coordinator = new MixerCoordinator(
            mockLayerStack as unknown as MixerLayerStack,
            mockStateManager as unknown as MixerStateManager
        );
    });

    it('should recompute state using baseState and apply it', async () => {
        const nextState: MixerState = { buses: { master: { gain: 0.5, sidechain: { enabled: false } } } };
        mockLayerStack.computeState.mockReturnValue(nextState);

        await coordinator.recompute();

        expect(mockLayerStack.computeState).toHaveBeenCalledWith({ buses: {} });
        expect(mockStateManager.applyState).toHaveBeenCalledWith(nextState, undefined);
    });

    it('should pass options through recompute to the state manager', async () => {
        const nextState: MixerState = { buses: {} };
        mockLayerStack.computeState.mockReturnValue(nextState);

        const options = { durationMs: 250, interruptible: true };
        await coordinator.recompute(options);

        expect(mockStateManager.applyState).toHaveBeenCalledWith(nextState, options);
    });

    it('should delegate getState to stateManager', () => {
        const currentState: MixerState = { buses: { music: { gain: 0.8, sidechain: { enabled: false } } } };
        mockStateManager.getState.mockReturnValue(currentState);

        const result = coordinator.getState();

        expect(result).toBe(currentState);
        expect(mockStateManager.getState).toHaveBeenCalledTimes(1);
    });

    it('should set a new base state and trigger recompute immediately', async () => {
        const newBaseState: MixerState = { buses: { sfx: { gain: 1, sidechain: { enabled: false } } } };
        const computedState: MixerState = { buses: { sfx: { gain: 0.5, sidechain: { enabled: false } } } };

        mockLayerStack.computeState.mockReturnValue(computedState);

        await coordinator.setBaseState(newBaseState);

        expect(mockLayerStack.computeState).toHaveBeenCalledWith(newBaseState);
        expect(mockStateManager.applyState).toHaveBeenCalledWith(computedState, undefined);
    });
});
