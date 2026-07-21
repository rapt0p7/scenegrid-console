import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import type { ISoundValidationRule } from '@domain/Validation/Ports/ISoundValidationRule.js';
import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import { isDefined } from '@scene-grid/shared';
import ContainerSourcesRule from '@domain/Validation/Rules/ContainerSourcesRule.js';

export default class ContainerSoundRule implements ISoundValidationRule {
    constructor(private readonly sourceRule = new ContainerSourcesRule()) {}

    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void {
        if (context.isContainer(cfg)) {
            context.assertRequiredType(`soundMap.${soundId}.mode`, cfg.mode, 'string');

            this.sourceRule.validate(context, `soundMap.${soundId}`, cfg.sources);

            if (isDefined(cfg.volumeRange)) context.validateTuple(`soundMap.${soundId}.volumeRange`, cfg.volumeRange);
            if (isDefined(cfg.pitchRange)) context.validateTuple(`soundMap.${soundId}.pitchRange`, cfg.pitchRange);
        }
    }
}
