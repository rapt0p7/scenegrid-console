import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { isAbsent, isDefined, typedEntries } from '@scene-grid/shared';

export default class RTPCManifestRule implements IValidationRule {
    public validate(context: IValidationContext) {
        if (isAbsent(context.config.rtpcManifest)) return;

        if (!context.assertOptionalType('rtpcManifest', context.config.rtpcManifest, 'object')) return;

        for (const [gameParamId, config] of typedEntries(context.config.rtpcManifest)) {
            const configPath = `rtpcManifest.${gameParamId}`;

            if (!context.assertRequiredType(configPath, config, 'object')) continue;

            if (isDefined(config.attack)) {
                context.assertOptionalType(`${configPath}.attack`, config.attack, 'number');
            }

            if (isDefined(config.release)) {
                context.assertOptionalType(`${configPath}.release`, config.release, 'number');
            }

            if (isDefined(config.defaultValue)) {
                context.assertOptionalType(`${configPath}.defaultValue`, config.defaultValue, 'number');
            }
        }
    }
}
