// noinspection D

import { isAbsent, evaluateRTPCCurve, Milliseconds } from '@scene-grid/shared';

import type { GameParamId, PlaybackId } from '@scene-grid/shared';
import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISoundController, RTPCParameterTarget } from '@domain/Shared/Ports/ISoundController.js';

interface RTPCBinding {
    readonly playbackId: PlaybackId;
    readonly paramId: GameParamId;
    readonly target: RTPCParameterTarget;
    readonly config: IRTPCConfig;
}

export class InstanceRTPCBinder {
    private readonly bindings: RTPCBinding[] = [];

    constructor(
        private readonly rtpcAdapter: IRTPCAdapter,
        private readonly soundController: ISoundController
    ) {}

    public bind(playbackId: PlaybackId, configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | undefined): void {
        if (isAbsent(configs)) return;

        let hasBindings = false;

        for (const [targetName, config] of Object.entries(configs)) {
            if (isAbsent(config)) continue;

            const target = targetName as RTPCParameterTarget;

            if (target !== 'gain' && target !== 'pitch' && target !== 'pan' && target !== 'filterFrequency') {
                continue;
            }

            this.bindings.push({
                playbackId,
                paramId: config.gameParam,
                target,
                config
            });

            hasBindings = true;

            // oxlint-disable-next-line unicorn/prefer-at
            this.applySingle(this.bindings[this.bindings.length - 1]);
        }

        if (hasBindings) {
            this.soundController.onVoiceEnded(playbackId, () => {
                this.unbind(playbackId);
            });
        }
    }

    public tickRTPC(): void {
        for (let i = 0; i < this.bindings.length; i++) {
            this.applySingle(this.bindings[i]);
        }
    }

    private applySingle(binding: RTPCBinding): void {
        const gameValue = this.rtpcAdapter.getValue(binding.paramId);

        const mappedValue = evaluateRTPCCurve(gameValue, binding.config.curve);
        const smoothing = binding.config.smoothing ?? (50 as Milliseconds);

        this.soundController.fadeParameter(binding.playbackId, binding.target, mappedValue, smoothing);
    }

    private unbind(playbackId: PlaybackId): void {
        for (let i = this.bindings.length - 1; i >= 0; i--) {
            if (this.bindings[i].playbackId === playbackId) {
                this.bindings[i] = this.bindings[this.bindings.length - 1];
                this.bindings.pop();
            }
        }
    }
}
