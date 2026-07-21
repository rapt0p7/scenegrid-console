// noinspection D

import type { ISoundValidationRule, IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { isDefined, typedEntries } from '@scene-grid/shared';
import type { ISoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import { RTPCRule } from '@domain/Validation/Rules/RTPCRule.js';
import DuckingTargetRule from '@domain/Validation/Rules/DuckingTargetRule.js';
import SpatialSettingsRule from '@domain/Validation/Rules/SpatialSettingsRule.js';
import LayeredSoundRule from '@domain/Validation/Rules/LayeredSoundRule.js';
import ContainerSoundRule from '@domain/Validation/Rules/ContainerSoundRule.js';
import SwitchSoundRule from '@domain/Validation/Rules/SwitchSoundRule.js';
import SmartLoopRule from '@domain/Validation/Rules/SmartLoopRule.js';
import ScattererSoundRule from '@domain/Validation/Rules/ScattererSoundRule.js';

export default class SoundMapRule implements IValidationRule {
    private readonly subRules: ISoundValidationRule[] = [
        new DuckingTargetRule(),
        new SpatialSettingsRule(),
        new LayeredSoundRule(),
        new ContainerSoundRule(),
        new SwitchSoundRule(),
        new SmartLoopRule(),
        new ScattererSoundRule()
    ];

    constructor(private readonly rtpcRule = new RTPCRule()) {}

    public validate(context: IValidationContext) {
        const validBuses = Object.keys(context.config.buses || {});

        for (const [soundId, cfg] of typedEntries(context.config.soundMap || {})) {
            if (!context.assertRequiredType(`soundMap.${soundId}`, cfg, 'object')) continue;

            const baseCfg = cfg;

            if ('busId' in baseCfg && isDefined(baseCfg.busId)) {
                context.assertOptionalType(`soundMap.${soundId}.busId`, baseCfg.busId, 'string');
                if (!validBuses.includes(baseCfg.busId as string)) {
                    context.addError(`Sound "${soundId}" references unknown bus "${baseCfg.busId}"`);
                }
            } else if (!('isContainer' in baseCfg) && !('smartLoop' in baseCfg) && !('isLayered' in baseCfg)) {
                context.addError(`Sound "${soundId}" has no busId`);
            }

            this.rtpcRule.validate(context, `soundMap.${soundId}`, (cfg as ISoundConfig).rtpc);

            for (const rule of this.subRules) {
                rule.validate(soundId, cfg, context);
            }
        }
    }
}
