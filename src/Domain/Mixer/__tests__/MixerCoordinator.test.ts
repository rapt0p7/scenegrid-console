import { describe, it, expect, vi, beforeEach } from 'vitest';

import MixerCoordinator from '@domain/Mixer/MixerCoordinator.js';

import type MixerLayerStack from '@domain/Mixer/MixerLayer.js';
import type MixerTransitionEngine from '@domain/Mixer/MixerTransitionEngine.js';
import type { MixerState } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';

describe('MixerCoordinator', () => {
    let coordinator: MixerCoordinator;
    let mockLayerStack: any;
    let mockTransitionEngine: any;

    beforeEach(() => {
        mockLayerStack = {
            computeState: vi.fn()
        };

        mockTransitionEngine = {
            applyState: vi.fn().mockResolvedValue(undefined),
            getState: vi.fn()
        };

        coordinator = new MixerCoordinator(
            mockLayerStack as unknown as MixerLayerStack,
            mockTransitionEngine as unknown as MixerTransitionEngine
        );
    });

    it('should recompute state using baseState and apply it', async () => {
        const nextState: MixerState = { buses: { master: { gain: 0.5 } } };
        mockLayerStack.computeState.mockReturnValue(nextState);

        await coordinator.recompute();

        expect(mockLayerStack.computeState).toHaveBeenCalledWith({ buses: {} });
        expect(mockTransitionEngine.applyState).toHaveBeenCalledWith(nextState, undefined);
    });

    it('should pass options through recompute to the state manager', async () => {
        const nextState: MixerState = { buses: {} };
        mockLayerStack.computeState.mockReturnValue(nextState);

        const options = { durationMs: 250, interruptible: true };
        await coordinator.recompute(options);

        expect(mockTransitionEngine.applyState).toHaveBeenCalledWith(nextState, options);
    });

    it('should delegate getState to stateManager', () => {
        const currentState: MixerState = { buses: { music: { gain: 0.8 } } };
        mockTransitionEngine.getState.mockReturnValue(currentState);

        const result = coordinator.getState();

        expect(result).toBe(currentState);
        expect(mockTransitionEngine.getState).toHaveBeenCalledTimes(1);
    });

    it('should set a new base state and trigger recompute immediately', async () => {
        const newBaseState: MixerState = { buses: { sfx: { gain: 1 } } };
        const computedState: MixerState = { buses: { sfx: { gain: 0.5 } } };

        mockLayerStack.computeState.mockReturnValue(computedState);

        await coordinator.setBaseState(newBaseState);

        expect(mockLayerStack.computeState).toHaveBeenCalledWith(newBaseState);
        expect(mockTransitionEngine.applyState).toHaveBeenCalledWith(computedState, undefined);
    });
});
