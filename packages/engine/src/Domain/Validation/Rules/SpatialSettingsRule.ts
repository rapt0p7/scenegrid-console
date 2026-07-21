// noinspection D

import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import type { ISoundValidationRule } from '@domain/Validation/Ports/ISoundValidationRule.js';
import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import { isAbsent, isDefined } from '@scene-grid/shared';

export default class SpatialSettingsRule implements ISoundValidationRule {
    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void {
        if ('spatial' in cfg) {
            const spatial = cfg.spatial;

            if (isAbsent(spatial)) return;

            if (!context.assertOptionalType(`soundMap.${soundId}.spatial`, spatial, 'object')) return;

            if (typeof spatial === 'object' && isDefined(spatial.distanceModel)) {
                const validModels = ['linear', 'inverse', 'exponential'];
                if (!validModels.includes(spatial.distanceModel)) {
                    context.addError(`Sound "${soundId}" has invalid distanceModel: "${spatial.distanceModel}"`);
                }
            }

            if (typeof spatial === 'object') {
                context.assertOptionalType(`soundMap.${soundId}.spatial.refDistance`, spatial.refDistance, 'number');
                context.assertOptionalType(`soundMap.${soundId}.spatial.maxDistance`, spatial.maxDistance, 'number');
                context.assertOptionalType(
                    `soundMap.${soundId}.spatial.rolloffFactor`,
                    spatial.rolloffFactor,
                    'number'
                );
            }

            if (
                isDefined((spatial as any).position) &&
                context.assertArray(`soundMap.${soundId}.spatial.position`, (spatial as any).position, false)
            ) {
                if ((spatial as any).position.length === 3) {
                    (spatial as any).position.forEach((value: any, index: number) => {
                        context.assertRequiredType(`soundMap.${soundId}.spatial.position[${index}]`, value, 'number');
                    });
                } else {
                    context.addError(`Sound "${soundId}" spatial.position must be [x, y, z] (3 numbers)`);
                }
            }
        }
    }
}
