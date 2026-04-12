import clamp from '@shared/clamp.js';

import type { IBaseSoundConfig, IPlayOptions } from '@domain/Configuration/Ports/ISoundConfig.js';

export class VariationResolver {
    public static apply(config: IBaseSoundConfig, options: IPlayOptions): IPlayOptions {
        if (!config.variation) return { ...options };

        const v = config.variation;
        const final: IPlayOptions = { ...options };

        if (v.pitchVar) {
            const delta = (Math.random() * 2 - 1) * v.pitchVar;
            final.rate = clamp((final.rate ?? 1) + delta, 0.1, 4);
        }

        if (v.volumeVar) {
            const delta = (Math.random() * 2 - 1) * v.volumeVar;
            final.volume = clamp((final.volume ?? 1) + delta, 0, 1);
        }

        if (v.randomOffset) {
            final.seek = Math.random() * v.randomOffset;
        }

        return final;
    }
}
