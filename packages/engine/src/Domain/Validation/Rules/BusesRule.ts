// oxlint-disable typescript/restrict-template-expressions
// noinspection D

import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { isDefined, typedEntries } from '@scene-grid/shared';
import { RTPCRule } from '@domain/Validation/Rules/RTPCRule.js';

export default class BusesRule implements IValidationRule {
    constructor(private readonly rtpcRule = new RTPCRule()) {}

    public validate(context: IValidationContext) {
        const validBuses = Object.keys(context.config.buses || {});

        if (validBuses.length === 0) {
            context.addError('No buses defined in config. At least one bus is required.');
            return;
        }

        if (isDefined(context.config.buses)) {
            for (const [busId, busCfg] of typedEntries(context.config.buses)) {
                if (!context.assertRequiredType(`buses.${busId}`, busCfg, 'object')) continue;

                context.assertOptionalType(`buses.${busId}.gain`, busCfg.gain, 'number');

                if (isDefined(busCfg.filter)) {
                    context.assertOptionalType(`buses.${busId}.filter`, busCfg.filter, 'object');
                    context.assertRequiredType(`buses.${busId}.filter.type`, busCfg.filter.type, 'string');
                }

                if (isDefined(busCfg.sends)) {
                    context.assertOptionalType(`buses.${busId}.sends`, busCfg.sends, 'object');
                    for (const [targetBus, gainValue] of typedEntries(busCfg.sends)) {
                        context.assertOptionalType(`buses.${busId}.sends.${targetBus}`, gainValue, 'number');
                        if (!validBuses.includes(targetBus)) {
                            context.addError(`Bus "${busId}" sends to unknown bus "${targetBus}"`);
                        }
                        if (busId === targetBus) {
                            context.addError(`Bus "${busId}" sends to itself (Feedback Loop!)`);
                        }
                    }
                }

                if (isDefined(busCfg.sidechain)) {
                    context.assertOptionalType(`buses.${busId}.sidechain`, busCfg.sidechain, 'object');
                    if (isDefined(busCfg.sidechain.enabled)) {
                        context.assertOptionalType(
                            `buses.${busId}.sidechain.enabled`,
                            busCfg.sidechain.enabled,
                            'boolean'
                        );
                    }
                }

                this.rtpcRule.validate(context, `buses.${busId}`, busCfg.rtpc);
            }
        }
    }
}
