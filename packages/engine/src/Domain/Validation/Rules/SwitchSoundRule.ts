// noinspection D

import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import type { ISoundValidationRule } from '@domain/Validation/Ports/ISoundValidationRule.js';
import type { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import { isDefined } from '@scene-grid/shared';

export default class SwitchSoundRule implements ISoundValidationRule {
    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void {
        if (context.isSwitch(cfg)) {
            context.assertRequiredType(`soundMap.${soundId}.switchGroup`, cfg.switchGroup, 'string');

            if (typeof cfg.switchGroup === 'string' && Object.keys(context.config.rtpcManifest).length > 0) {
                if (!(cfg.switchGroup in context.config.rtpcManifest)) {
                    context.addError(`Switch "${soundId}" uses unknown switchGroup (RTPC param) "${cfg.switchGroup}".`);
                }
            }

            if (typeof cfg.switches !== 'object' || cfg.switches === null || Array.isArray(cfg.switches)) {
                context.addError(`Type Error at "soundMap.${soundId}.switches": expected an object.`);
                return;
            }

            const switchKeys = Object.keys(cfg.switches);

            if (switchKeys.length === 0 && !isDefined(cfg.defaultSwitch)) {
                context.addWarning(`Switch "${soundId}" has empty switches and no defaultSwitch.`);
            }

            for (const [stateKey, targetId] of Object.entries(cfg.switches)) {
                context.assertRequiredType(`soundMap.${soundId}.switches[${stateKey}]`, targetId, 'string');

                if (isDefined(targetId) && !context.config.manifest[targetId] && !context.config.soundMap[targetId]) {
                    context.addWarning(`Switch "${soundId}" references missing source "${targetId}".`);
                }
            }

            if (isDefined(cfg.defaultSwitch)) {
                context.assertRequiredType(`soundMap.${soundId}.defaultSwitch`, cfg.defaultSwitch, 'string');

                if (!context.config.manifest[cfg.defaultSwitch] && !context.config.soundMap[cfg.defaultSwitch]) {
                    context.addWarning(`Switch "${soundId}" references missing defaultSwitch "${cfg.defaultSwitch}".`);
                }
            }

            if (isDefined(cfg.hysteresis)) {
                if (context.assertOptionalType(`soundMap.${soundId}.hysteresis`, cfg.hysteresis, 'number')) {
                    if (cfg.hysteresis < 0) {
                        context.addError(`Switch "${soundId}" hysteresis cannot be negative.`);
                    }
                }
            }
        }
    }
}
