// noinspection D

import { clamp, isAbsent, isDefined } from '@scene-grid/shared';

import type { IBaseSoundConfig, IPlayOptions } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { IPRNG } from '@scene-grid/shared';

type WritablePlayOptions = { -readonly [K in keyof IPlayOptions]: IPlayOptions[K] };

// oxlint-disable-next-line typescript/no-extraneous-class
export class VariationResolver {
    public static apply(config: IBaseSoundConfig, options: IPlayOptions, prng: IPRNG): IPlayOptions {
        if (isAbsent(config.variation)) return { ...options };

        const v = config.variation;
        const final: WritablePlayOptions = { ...options };

        if (isDefined(v.pitchVar)) {
            const delta = prng.nextRange(-v.pitchVar, v.pitchVar);

            final.rate = clamp((final.rate ?? 1) + delta, 0.1, 4);
        }

        if (isDefined(v.volumeVar)) {
            const delta = prng.nextRange(-v.volumeVar, v.volumeVar);

            final.volume = clamp((final.volume ?? 1) + delta, 0, 1);
        }

        if (isDefined(v.randomOffset)) {
            final.seek = prng.nextRange(0, v.randomOffset);
        }

        return final;
    }
}
