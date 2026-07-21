// oxlint-disable max-lines-per-function
// noinspection D

import type { IComponentValidationRule } from '@domain/Validation/Ports/IComponentValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import type { RTPCTargetProperty, IRTPCConfig } from '@domain/Configuration/Ports/IRTPCConfig.js';
import { DeepReadonly, isAbsent } from '@scene-grid/shared';
import { isDefined, typedEntries } from '@scene-grid/shared';

type RtpcMap = DeepReadonly<Partial<Record<RTPCTargetProperty, IRTPCConfig>>>;

export class RTPCRule implements IComponentValidationRule<RtpcMap> {
    public validate(context: IValidationContext, path: string, rtpcMap: RtpcMap | undefined): void {
        if (isAbsent(rtpcMap)) return;
        if (!context.assertOptionalType(`${path}.rtpc`, rtpcMap, 'object')) return;

        const validBuses = Object.keys(context.config.buses || {});
        const validCurveTypes = new Set(['linear', 'logarithmic', 'exponential', 's-curve']);
        const validTargets = new Set(['gain', 'filterFrequency', 'pan', 'pitch', 'sendLevel']);

        for (const [targetName, config] of typedEntries(rtpcMap)) {
            if (isAbsent(config)) continue;

            const configPath = `${path}.rtpc.${targetName}`;

            if (!validTargets.has(targetName)) {
                context.addError(`${configPath} uses unknown RTPC target "${targetName}".`);
                continue;
            }

            const rConfig = config as IRTPCConfig;

            if (!context.assertRequiredType(`${configPath}.gameParam`, rConfig.gameParam, 'string')) continue;

            if (isDefined(rConfig.smoothing)) {
                context.assertOptionalType(`${configPath}.smoothing`, rConfig.smoothing, 'number');
            }

            const curve = rConfig.curve;
            if (isAbsent(curve)) {
                context.addError(`Missing required field at "${configPath}.curve"`);
            } else if (Array.isArray(curve)) {
                if (curve.length < 2) {
                    context.addError(`${configPath}.curve has invalid curve (needs >= 2 points).`);
                } else {
                    for (const [index, point] of curve.entries()) {
                        context.assertRequiredType(`${configPath}.curve[${index}].x`, point?.x, 'number');
                        context.assertRequiredType(`${configPath}.curve[${index}].y`, point?.y, 'number');
                    }
                }
            } else if (typeof curve === 'object' && curve !== null && 'type' in curve) {
                const preset = curve;

                if (
                    context.assertRequiredType(`${configPath}.curve.type`, preset.type, 'string') &&
                    !validCurveTypes.has(preset.type)
                ) {
                    context.addError(`${configPath}.curve has invalid type "${preset.type}"`);
                }
                context.assertRequiredType(`${configPath}.curve.minX`, preset.minX, 'number');
                context.assertRequiredType(`${configPath}.curve.maxX`, preset.maxX, 'number');
                context.assertRequiredType(`${configPath}.curve.minY`, preset.minY, 'number');
                context.assertRequiredType(`${configPath}.curve.maxY`, preset.maxY, 'number');
            } else {
                context.addError(`Type Error at "${configPath}.curve": expected array or valid preset object`);
            }

            if (targetName === 'sendLevel') {
                if (isAbsent(rConfig.sendTargetBus)) {
                    context.addError(`${configPath} is missing 'sendTargetBus'.`);
                } else if (!validBuses.includes(rConfig.sendTargetBus as string)) {
                    context.addError(`${configPath} references unknown bus "${rConfig.sendTargetBus}".`);
                }
            } else if (isDefined(rConfig.sendTargetBus)) {
                context.addError(`${configPath} specifies 'sendTargetBus', but target property is not 'sendLevel'.`);
            }
        }
    }
}
