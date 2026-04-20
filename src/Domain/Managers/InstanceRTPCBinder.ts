// noinspection D

import { isAbsent } from '@shared/guards.js';
import { evaluateRTPCCurve } from '@shared/Math/rtpcMath.js';

import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISoundController, RTPCParameterTarget } from '@domain/Shared/Ports/ISoundController.js';
import type { PlaybackId } from '@domain/Types/Branded.js';

interface ICleanupState {
    isCleanedUp: boolean;
}

// oxlint-disable-next-line typescript/no-extraneous-class
export class InstanceRTPCBinder {
    public static bind(
        playbackId: PlaybackId,
        configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | undefined,
        rtpcAdapter: IRTPCAdapter,
        soundController: ISoundController
    ): void {
        if (isAbsent(configs)) return;

        const rtpcUnsubs: Array<() => void> = [];
        const state: ICleanupState = { isCleanedUp: false };

        for (const [targetName, config] of Object.entries(configs)) {
            if (isAbsent(config)) continue;

            const target = targetName as RTPCParameterTarget;

            if (target !== 'gain' && target !== 'pitch' && target !== 'pan' && target !== 'filterFrequency') {
                continue;
            }

            const handler = this.createHandler(playbackId, target, config, soundController, state);

            rtpcAdapter.on(config.gameParam, handler);
            rtpcUnsubs.push(() => {
                rtpcAdapter.off(config.gameParam, handler);
            });

            handler(rtpcAdapter.getValue(config.gameParam));
        }

        if (rtpcUnsubs.length === 0) return;

        const cleanup = (): void => {
            if (state.isCleanedUp) return;
            state.isCleanedUp = true;
            for (const unsub of rtpcUnsubs) unsub();
        };

        soundController.onVoiceEnded(playbackId, cleanup);
    }

    private static createHandler(
        playbackId: PlaybackId,
        target: RTPCParameterTarget,
        config: IRTPCConfig,
        soundController: ISoundController,
        state: ICleanupState
    ): (gameValue: number) => void {
        return (gameValue: number): void => {
            if (state.isCleanedUp) return;

            const mappedValue = evaluateRTPCCurve(gameValue, config.curve);
            const smoothing = config.smoothingMs ?? 50;

            soundController.fadeParameter(playbackId, target, mappedValue, smoothing);
        };
    }
}
