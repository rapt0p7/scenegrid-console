// noinspection D

import type { ISwitchSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { ISwitchPlaybackState } from '@domain/Managers/Ports/ISwitchPlaybackState.js';
import type { SoundId } from '@scene-grid/shared';

import { isDefined } from '@scene-grid/shared';

export default class SwitchPlaybackPolicy {
    // oxlint-disable-next-line max-lines-per-function
    public evaluateNext(
        config: ISwitchSoundConfig,
        currentValue: number | string,
        currentState?: ISwitchPlaybackState
    ): { soundId: SoundId | null; nextState: ISwitchPlaybackState } {
        if (typeof currentValue === 'string') {
            return {
                soundId: config.switches[currentValue] ?? config.defaultSwitch ?? null,
                nextState: { currentSwitchKey: currentValue }
            };
        }

        const keys = Object.keys(config.switches)
            .map(Number)
            .filter(k => !Number.isNaN(k))
            // oxlint-disable-next-line unicorn/no-array-sort
            .sort((a, b) => a - b);

        let targetKey: number | null = keys.length > 0 ? keys[0] : null;

        for (const key of keys) {
            if (currentValue >= key) targetKey = key;
        }

        if (config.hysteresis && isDefined(currentState?.currentSwitchKey) && targetKey !== null) {
            const prevKey = Number(currentState.currentSwitchKey);

            if (targetKey > prevKey) {
                if (currentValue < targetKey + config.hysteresis) {
                    targetKey = prevKey;
                }
            } else if (targetKey < prevKey) {
                if (currentValue > prevKey - config.hysteresis) {
                    targetKey = prevKey;
                }
            }
        }

        const soundId = targetKey === null ? config.defaultSwitch : config.switches[targetKey];

        return {
            soundId: soundId ?? null,
            nextState: { currentSwitchKey: targetKey }
        };
    }
}
