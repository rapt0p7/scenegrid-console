// noinspection D

import { evaluateRTPCCurve } from '../helpers/rtpcMath';

import type { IRTPCConfig, IRTPCManager, RTPCTargetProperty } from '../interfaces/IRTPCManager';
import type { ISoundInstance, InstanceParameterTarget } from '@webaudio-core';

export class InstanceRTPCBinder {
    public static bind(
        instance: ISoundInstance,
        configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> | undefined,
        rtpcManager: IRTPCManager
    ): void {
        if (!configs) return;

        const rtpcUnsubs: Array<() => void> = [];
        let isCleanedUp = false;

        for (const [targetName, config] of Object.entries(configs)) {
            if (!config) continue;

            const target = targetName as InstanceParameterTarget;

            if (target !== 'gain' && target !== 'pitch' && target !== 'pan' && target !== 'filterFrequency') {
                continue;
            }

            const handler = (gameValue: number) => {
                if (isCleanedUp) return;
                const mappedValue = evaluateRTPCCurve(gameValue, config.curve);
                const smoothing = config.smoothingMs ?? 50;
                instance.automate(target, mappedValue, smoothing);
            };

            rtpcManager.events.on(config.gameParam, handler);
            rtpcUnsubs.push(() => rtpcManager.events.off(config.gameParam, handler));

            handler(rtpcManager.getValue(config.gameParam));
        }

        if (rtpcUnsubs.length === 0) return;

        const instanceUnsubs: Array<() => void> = [];

        const cleanup = () => {
            if (isCleanedUp) return;
            isCleanedUp = true;

            for (const unsub of rtpcUnsubs) unsub();
            for (const unsub of instanceUnsubs) unsub();
        };

        instanceUnsubs.push(instance.on('ended', cleanup));
        instanceUnsubs.push(instance.on('stopped', cleanup));
        instanceUnsubs.push(instance.on('disposed', cleanup));
    }
}
