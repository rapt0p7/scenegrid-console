// noinspection D

import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import type { ISoundValidationRule } from '@domain/Validation/Ports/ISoundValidationRule.js';
import type { AnySoundConfig, ISmartLoopSoundConfig } from '@domain/Configuration/Ports/ISoundConfig.js';
import { type DeepReadonly, isAbsent, isDefined, typedEntries } from '@scene-grid/shared';

export default class SmartLoopRule implements ISoundValidationRule {
    validate(soundId: string, cfg: AnySoundConfig, context: IValidationContext): void {
        if (context.isSmartLoop(cfg)) {
            if (!context.assertRequiredType(`soundMap.${soundId}.smartLoop`, cfg.smartLoop, 'object')) return;

            context.assertOptionalType(`soundMap.${soundId}.smartLoop.bpm`, cfg.smartLoop.bpm, 'number');
            context.assertOptionalType(`soundMap.${soundId}.smartLoop.crossfade`, cfg.smartLoop.crossfade, 'number');

            if (!context.assertRequiredType(`soundMap.${soundId}.smartLoop.regions`, cfg.smartLoop.regions, 'object'))
                return;

            for (const [regionId, range] of typedEntries(cfg.smartLoop.regions)) {
                if (context.assertArray(`soundMap.${soundId}.smartLoop.regions.${regionId}`, range, false)) {
                    if (
                        range.length < 2 ||
                        range.length > 4 ||
                        typeof range[0] !== 'number' ||
                        typeof range[1] !== 'number'
                    ) {
                        context.addError(
                            `SmartLoop "${soundId}" region "${regionId}" must be an array of 2 to 4 numbers.`
                        );
                    } else if (range[0] >= range[1]) {
                        context.addError(
                            `SmartLoop "${soundId}" region "${regionId}" has invalid range (${range[0]} >= ${range[1]})`
                        );
                    } else {
                        if (range.length >= 3 && typeof range[2] !== 'number') {
                            context.addError(`SmartLoop "${soundId}" region "${regionId}" preEntry must be a number.`);
                        }
                        if (range.length === 4 && typeof range[3] !== 'number') {
                            context.addError(`SmartLoop "${soundId}" region "${regionId}" tail must be a number.`);
                        }
                    }
                }
            }

            this.validateMagnets(context, soundId, cfg);
        }
    }

    // oxlint-disable-next-line max-lines-per-function
    private validateMagnets(
        context: IValidationContext,
        soundId: string,
        cfg: DeepReadonly<ISmartLoopSoundConfig>
    ): void {
        const magnets = cfg.smartLoop.magnets;
        if (isAbsent(magnets)) return;

        const magnetsArray = magnets as any[];
        if (!context.assertArray(`soundMap.${soundId}.smartLoop.magnets`, magnetsArray, true)) return;

        const length = magnetsArray.length;
        for (let i = 0; i < length; i++) {
            const magnetPath = `soundMap.${soundId}.smartLoop.magnets[${i}]`;

            const magnet = magnetsArray[i] as Record<string, any>;

            if (!context.assertRequiredType(magnetPath, magnet, 'object')) continue;
            context.assertRequiredType(`${magnetPath}.region`, magnet.region, 'string');
            context.assertRequiredType(`${magnetPath}.targetRegion`, magnet.targetRegion, 'string');
            context.assertRequiredType(`${magnetPath}.quantize`, magnet.quantize, 'string');

            context.assertOptionalType(`${magnetPath}.transitionRegionName`, magnet.transitionRegionName, 'string');
            context.assertOptionalType(`${magnetPath}.crossfadeDuration`, magnet.crossfadeDuration, 'number');
            context.assertOptionalType(`${magnetPath}.tailDuration`, magnet.tailDuration, 'number');

            if (
                isDefined(magnet.offsetMode) &&
                context.assertOptionalType(`${magnetPath}.offsetMode`, magnet.offsetMode, 'string')
            ) {
                const mode = magnet.offsetMode as string;
                if (mode !== 'None' && mode !== 'Relative' && mode !== 'Inverted') {
                    context.addError(
                        // oxlint-disable-next-line typescript/restrict-template-expressions
                        `SmartLoop "${soundId}" region "${magnet.region}" magnet has invalid offsetMode "${mode}". Expected 'None', 'Relative', or 'Inverted'.`
                    );
                }
            }

            const condition = magnet.condition;
            if (context.assertRequiredType(`${magnetPath}.condition`, condition, 'object')) {
                const condObj = condition as Record<string, any>;
                const param = condObj.param;

                if (context.assertRequiredType(`${magnetPath}.condition.param`, param, 'string')) {
                    if (
                        Object.keys(context.config.rtpcManifest).length > 0 &&
                        !(param in context.config.rtpcManifest)
                    ) {
                        context.addError(
                            `SmartLoop "${soundId}" uses unknown RTPC param "${param}" in magnet condition.`
                        );
                    }
                }

                context.assertRequiredType(`${magnetPath}.condition.operator`, condObj.operator, 'string');
                context.assertRequiredType(`${magnetPath}.condition.value`, condObj.value, 'number');

                if (isDefined(condObj.hysteresis)) {
                    if (
                        context.assertOptionalType(`${magnetPath}.condition.hysteresis`, condObj.hysteresis, 'number')
                    ) {
                        // oxlint-disable-next-line max-depth
                        if (isDefined(condObj.hysteresis) && condObj.hysteresis < 0) {
                            context.addError(`Hysteresis at "${magnetPath}.condition.hysteresis" cannot be negative.`);
                        }
                    }
                }
            }
        }
    }
}
