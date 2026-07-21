import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import type { ISoundValidationRule } from '@domain/Validation/Ports/ISoundValidationRule.js';
import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import { isDefined } from '@scene-grid/shared';

export default class LayeredSoundRule implements ISoundValidationRule {
    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void {
        if (context.isLayered(cfg)) {
            if (!context.assertArray(`soundMap.${soundId}.layers`, cfg.layers, false)) return;

            for (const [index, layer] of cfg.layers.entries()) {
                const path = `soundMap.${soundId}.layers[${index}]`;
                if (context.assertRequiredType(path, layer, 'object')) {
                    context.assertRequiredType(`${path}.src`, layer.src, 'string');
                    context.assertOptionalType(`${path}.delay`, layer.delay, 'number');
                    context.assertOptionalType(`${path}.volume`, layer.volume, 'number');

                    if (
                        isDefined(layer.src) &&
                        !context.config.manifest[layer.src] &&
                        !context.config.soundMap[layer.src]
                    ) {
                        context.addError(`Layered sound "${soundId}" references missing audio "${layer.src}"`);
                    }
                }
            }
        }
    }
}
