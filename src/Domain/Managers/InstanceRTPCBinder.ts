/* eslint-disable max-params */
// noinspection D

import { evaluateRTPCCurve } from '@shared/Math/rtpcMath.js';

import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISoundController, RTPCParameterTarget } from '@domain/Shared/Ports/ISoundController.js';
import type { PlaybackId } from '@domain/Types/Branded.js';

export class InstanceRTPCBinder {
    public static bind(
        playbackId: PlaybackId,
        configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | undefined,
        rtpcAdapter: IRTPCAdapter,
        soundController: ISoundController
    ): void {
        if (!configs) return;

        const rtpcUnsubs: Array<() => void> = [];
        let isCleanedUp = false;

        for (const [targetName, config] of Object.entries(configs)) {
            if (!config) continue;

            const target = targetName as RTPCParameterTarget;

            if (target !== 'gain' && target !== 'pitch' && target !== 'pan' && target !== 'filterFrequency') {
                continue;
            }

            const handler = (gameValue: number): void => {
                if (isCleanedUp) return;
                const mappedValue = evaluateRTPCCurve(gameValue, config.curve);
                const smoothing = config.smoothingMs ?? 50;

                soundController.fadeParameter(playbackId, target, mappedValue, smoothing);
            };

            rtpcAdapter.on(config.gameParam, handler);
            rtpcUnsubs.push(() => rtpcAdapter.off(config.gameParam, handler));

            handler(rtpcAdapter.getValue(config.gameParam));
        }

        if (rtpcUnsubs.length === 0) return;

        const cleanup = (): void => {
            if (isCleanedUp) return;
            isCleanedUp = true;
            for (const unsub of rtpcUnsubs) unsub();
        };

        soundController.onVoiceEnded(playbackId, cleanup);
    }
}
