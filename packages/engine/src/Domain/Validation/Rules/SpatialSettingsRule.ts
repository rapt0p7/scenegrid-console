// noinspection D

import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { ISoundValidationRule } from '@domain/Validation/Ports/ISoundValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';

import { isAbsent, isDefined } from '@scene-grid/shared';

export default class SpatialSettingsRule implements ISoundValidationRule {
    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void {
        if ('spatial' in cfg) {
            const spatial = cfg.spatial;

            if (isAbsent(spatial)) return;
            if (typeof spatial === 'boolean') return;

            if (typeof spatial !== 'object' || Array.isArray(spatial)) {
                const actualType = Array.isArray(spatial) ? 'array' : typeof spatial;
                context.addError(
                    `Type Error at "soundMap.${soundId}.spatial": expected boolean or object, got ${actualType}`
                );
                return;
            }

            if (isDefined(spatial.distanceModel)) {
                const validModels = ['linear', 'inverse', 'exponential'];
                if (!validModels.includes(spatial.distanceModel)) {
                    context.addError(`Sound "${soundId}" has invalid distanceModel: "${spatial.distanceModel}"`);
                }
            }

            if (isDefined(spatial.panningModel)) {
                const validPanningModels = ['equalpower', 'HRTF'];
                if (!validPanningModels.includes(spatial.panningModel)) {
                    context.addError(`Sound "${soundId}" has invalid panningModel: "${spatial.panningModel}"`);
                }
            }

            context.assertOptionalType(`soundMap.${soundId}.spatial.refDistance`, spatial.refDistance, 'number');
            context.assertOptionalType(`soundMap.${soundId}.spatial.maxDistance`, spatial.maxDistance, 'number');
            context.assertOptionalType(`soundMap.${soundId}.spatial.rolloffFactor`, spatial.rolloffFactor, 'number');
        }
    }
}
