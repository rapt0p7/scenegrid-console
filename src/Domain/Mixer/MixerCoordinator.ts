import type MixerLayerStack from './MixerLayer.js';
import type MixerStateManager from './MixerStateManager.js';
import type { MixerState } from '../../interfaces/IMixerStateManager.js';

export default class MixerCoordinator {
    private baseState: MixerState = { buses: {} };

    constructor(
        private readonly layerStack: MixerLayerStack,
        private readonly stateManager: MixerStateManager
    ) {}

    recompute(options?: { durationMs?: number; interruptible?: boolean }): Promise<void> {
        const next = this.layerStack.computeState(this.baseState);
        return this.stateManager.applyState(next, options);
    }

    getState(): MixerState {
        return this.stateManager.getState();
    }

    setBaseState(state: MixerState): Promise<void> {
        this.baseState = state;
        return this.recompute();
    }
}
