import type MixerLayerStack from '@domain/Mixer/MixerLayer.js';
import type MixerTransitionEngine from '@domain/Mixer/MixerTransitionEngine.js';
import type { ITransitionOptions, MixerState } from '@domain/Mixer/Ports/IMixerTransitionEngine.js';
import { DeepReadonly } from '@shared/DeepReadonly.js';

export default class MixerCoordinator {
    private baseState: MixerState = { buses: {} };

    constructor(
        private readonly layerStack: MixerLayerStack,
        private readonly stateManager: MixerTransitionEngine
    ) {}

    recompute(options?: DeepReadonly<ITransitionOptions>): void {
        const next = this.layerStack.computeState(this.baseState);
        this.stateManager.applyState(next, options);
    }

    getState(): MixerState {
        return this.stateManager.getState();
    }

    setBaseState(state: DeepReadonly<MixerState>): void {
        this.baseState = state;
        this.recompute();
    }
}
