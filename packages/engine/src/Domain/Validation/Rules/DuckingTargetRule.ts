// noinspection D

import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import type { ISoundValidationRule } from '@domain/Validation/Ports/ISoundValidationRule.js';
import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import { isAbsent, isDefined } from '@scene-grid/shared';

export default class DuckingTargetRule implements ISoundValidationRule {
    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void {
        if ('ducking' in cfg) {
            const ducking = cfg.ducking;
            if (isAbsent(ducking)) return;

            if (!context.assertOptionalType(`soundMap.${soundId}.ducking`, ducking, 'object')) return;

            const validBuses = Object.keys(context.config.buses || {});

            if (isDefined(ducking.target)) {
                const targets = Array.isArray(ducking.target) ? ducking.target : [ducking.target];
                for (const target of targets) {
                    if (typeof target !== 'string') {
                        context.addError(`Sound "${soundId}" has non-string ducking target`);
                        continue;
                    }
                    if (validBuses.includes(target)) {
                        const targetBusCfg = context.config.buses[target];
                        if (isAbsent(targetBusCfg.sidechain) || !targetBusCfg.sidechain.enabled) {
                            context.addError(
                                `Sound "${soundId}" targets bus "${target}" for ducking, but sidechain is not enabled on "${target}" bus.`
                            );
                        }
                    } else {
                        context.addError(`Sound "${soundId}" has invalid ducking target "${target}"`);
                    }
                }
            }
        }
    }
}
