// noinspection D

import clamp from '@shared/clamp.js';
import { isAbsent, isDefined } from '@shared/guards.js';

import type { IBaseSoundConfig, IPlayOptions } from '@domain/Configuration/Ports/ISoundConfig.js';

type WritablePlayOptions = { -readonly [K in keyof IPlayOptions]: IPlayOptions[K] };

// oxlint-disable-next-line typescript/no-extraneous-class
export class VariationResolver {
    public static apply(config: IBaseSoundConfig, options: IPlayOptions): IPlayOptions {
        if (isAbsent(config.variation)) return { ...options };

        const v = config.variation;
        const final: WritablePlayOptions = { ...options };

        if (isDefined(v.pitchVar)) {
            const delta = (Math.random() * 2 - 1) * v.pitchVar;
            final.rate = clamp((final.rate ?? 1) + delta, 0.1, 4);
        }

        if (isDefined(v.volumeVar)) {
            const delta = (Math.random() * 2 - 1) * v.volumeVar;
            final.volume = clamp((final.volume ?? 1) + delta, 0, 1);
        }

        if (isDefined(v.randomOffset)) {
            final.seek = Math.random() * v.randomOffset;
        }

        return final;
    }
}
