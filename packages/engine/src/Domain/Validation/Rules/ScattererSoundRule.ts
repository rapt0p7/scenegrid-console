// oxlint-disable max-depth max-lines-per-function
// noinspection D

import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import type { ISoundValidationRule } from '@domain/Validation/Ports/ISoundValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';

import ContainerSourcesRule from '@domain/Validation/Rules/ContainerSourcesRule.js';
import QuantizeRule from '@domain/Validation/Rules/QuantizeRule.js';
import { isDefined } from '@scene-grid/shared';

export default class ScattererSoundRule implements ISoundValidationRule {
    constructor(
        private readonly sourceRule = new ContainerSourcesRule(),
        private readonly quantizeRule = new QuantizeRule()
    ) {}

    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void {
        if (context.isScatterer(cfg)) {
            const path = `soundMap.${soundId}`;

            this.sourceRule.validate(context, path, cfg.sources);

            context.validateTuple(`${path}.spawnRate`, cfg.spawnRate);
            if (isDefined(cfg.scatterDistance)) {
                context.validateTuple(`${path}.scatterDistance`, cfg.scatterDistance);
            }

            if (isDefined(cfg.maxPolyphony)) {
                if (context.assertOptionalType(`${path}.maxPolyphony`, cfg.maxPolyphony, 'number')) {
                    if (cfg.maxPolyphony <= 0) {
                        context.addError(`Scatterer "${soundId}" maxPolyphony must be strictly greater than 0.`);
                    }
                }
            }

            if (isDefined(cfg.sync)) {
                if (context.assertRequiredType(`${path}.sync`, cfg.sync, 'object')) {
                    const syncPath = `${path}.sync`;
                    const syncObj = cfg.sync;

                    this.quantizeRule.validate(context, `${syncPath}.quantize`, syncObj.quantize, { required: true });

                    if (
                        context.assertRequiredType(`${syncPath}.referenceTrackId`, syncObj.referenceTrackId, 'string')
                    ) {
                        const refId = syncObj.referenceTrackId;

                        if (context.config.soundMap[refId as any]) {
                            const refCfg = context.config.soundMap[refId as any];
                            if (!context.isSmartLoop(refCfg)) {
                                context.addError(
                                    `Scatterer sync reference track "${refId}" at "${syncPath}" must be a smartLoop sound to provide a music grid.`
                                );
                            }
                        } else {
                            context.addError(
                                `Scatterer sync reference track "${refId}" at "${syncPath}" does not exist in soundMap.`
                            );
                        }
                    }
                }
            }
        }
    }
}
