import type MixerLayerStack from '@domain/Mixer/MixerLayer.js';
import type MixerTransitionEngine from '@domain/Mixer/MixerTransitionEngine.js';
import type { MixerState } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';

export default class MixerCoordinator {
    private baseState: MixerState = { buses: {} };

    constructor(
        private readonly layerStack: MixerLayerStack,
        private readonly stateManager: MixerTransitionEngine
    ) {}

    recompute(options?: { durationMs?: number; interruptible?: boolean }): void {
        const next = this.layerStack.computeState(this.baseState);
        return this.stateManager.applyState(next, options);
    }

    getState(): MixerState {
        return this.stateManager.getState();
    }

    setBaseState(state: MixerState): void {
        this.baseState = state;
        return this.recompute();
    }
}
