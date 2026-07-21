// oxlint-disable max-depth max-lines-per-function
// noinspection D

import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { isAbsent, isDefined, typedEntries } from '@scene-grid/shared';

export default class EventsRule implements IValidationRule {
    public validate(context: IValidationContext) {
        if (isAbsent(context.config.events)) return;
        if (!context.assertOptionalType('events', context.config.events, 'object')) return;

        for (const [eventIdRaw, eventConfigOriginal] of typedEntries(context.config.events)) {
            const eventId = eventIdRaw as string;
            const eventPath = `events.${eventId}`;

            const eventConfig = eventConfigOriginal as Record<string, any>;

            if (!context.assertRequiredType(eventPath, eventConfig, 'object')) continue;

            const actions = eventConfig.actions;
            if (!context.assertArray(`${eventPath}.actions`, actions, false)) continue;

            const actionsArray = actions as any[];
            const actionsLength = actionsArray.length;

            for (let index = 0; index < actionsLength; index++) {
                const actionPath = `${eventPath}.actions[${index}]`;
                const action = actionsArray[index] as Record<string, any>;

                if (!context.assertRequiredType(actionPath, action, 'object')) continue;
                if (!context.assertRequiredType(`${actionPath}.type`, action.type, 'string')) continue;

                if (isDefined(action.delay)) {
                    if (context.assertOptionalType(`${actionPath}.delay`, action.delay, 'number')) {
                        if (isDefined(action.delay) && action.delay < 0) {
                            context.addError(`Action at "${actionPath}.delay" cannot be negative.`);
                        }
                    }
                }

                if (isDefined(action.probability)) {
                    if (context.assertOptionalType(`${actionPath}.probability`, action.probability, 'number')) {
                        if (isDefined(action.probability) && (action.probability < 0 || action.probability > 1)) {
                            context.addError(`Action at "${actionPath}.probability" must be between 0.0 and 1.0.`);
                        }
                    }
                }

                if (isDefined(action.condition)) {
                    if (context.assertOptionalType(`${actionPath}.condition`, action.condition, 'object')) {
                        const conditionPath = `${actionPath}.condition`;
                        const cond = action.condition as Record<string, any>;

                        const param = cond.param;
                        if (context.assertRequiredType(`${conditionPath}.param`, param, 'string')) {
                            if (
                                context.config.rtpcManifest &&
                                Object.keys(context.config.rtpcManifest).length > 0 &&
                                !(param in context.config.rtpcManifest)
                            ) {
                                context.addError(
                                    `Event "${eventId}" uses unknown RTPC param "${param}" in condition at ${conditionPath}.`
                                );
                            }
                        }

                        const operator = cond.operator;
                        if (context.assertRequiredType(`${conditionPath}.operator`, operator, 'string')) {
                            const validOperators = ['==', '!=', '>', '>=', '<', '<='];
                            if (!validOperators.includes(operator)) {
                                context.addError(`Invalid operator "${operator}" at ${conditionPath}.operator.`);
                            }
                        }

                        context.assertRequiredType(`${conditionPath}.value`, cond.value, 'number');

                        if (isDefined(cond.hysteresis)) {
                            if (context.assertOptionalType(`${conditionPath}.hysteresis`, cond.hysteresis, 'number')) {
                                if (isDefined(cond.hysteresis) && cond.hysteresis < 0) {
                                    context.addError(`Action at "${conditionPath}.hysteresis" cannot be negative.`);
                                }
                            }
                        }
                    }
                }

                const actionType = action.type;

                switch (actionType) {
                    case 'play':
                    case 'pause':
                    case 'resume': {
                        const target = action.target;
                        if (context.assertRequiredType(`${actionPath}.target`, target, 'string')) {
                            context.checkTargetExists(eventId, actionPath, target);
                        }
                        break;
                    }

                    case 'stop': {
                        const target = action.target;
                        if (context.assertRequiredType(`${actionPath}.target`, target, 'string')) {
                            context.checkTargetExists(eventId, actionPath, target);
                        }

                        const options = action.options;
                        if (isDefined(options)) {
                            if (context.assertRequiredType(`${actionPath}.options`, options, 'object')) {
                                const opts = options as Record<string, any>;
                                context.assertOptionalType(
                                    `${actionPath}.options.allowTail`,
                                    opts.allowTail,
                                    'boolean'
                                );
                                context.assertOptionalType(`${actionPath}.options.fadeOut`, opts.fadeOut, 'number');
                            }
                        }
                        break;
                    }

                    case 'set_rtpc': {
                        const param = action.param;
                        if (context.assertRequiredType(`${actionPath}.param`, param, 'string')) {
                            if (
                                context.config.rtpcManifest &&
                                Object.keys(context.config.rtpcManifest).length > 0 &&
                                !(param in context.config.rtpcManifest)
                            ) {
                                context.addError(
                                    `Event "${eventId}" uses unknown RTPC param "${param}" at ${actionPath}.`
                                );
                            }
                        }
                        context.assertRequiredType(`${actionPath}.value`, action.value, 'number');
                        break;
                    }

                    case 'start_loop':
                        context.assertRequiredType(`${actionPath}.target`, action.target, 'string');
                        context.assertRequiredType(`${actionPath}.startRegion`, (action as any).startRegion, 'string');
                        break;

                    case 'stop_loop':
                        context.assertRequiredType(`${actionPath}.target`, action.target, 'string');
                        break;

                    case 'music_transition': {
                        const transitionAction = action;
                        context.assertRequiredType(`${actionPath}.target`, transitionAction.target, 'string');
                        context.assertRequiredType(
                            `${actionPath}.targetRegion`,
                            transitionAction.targetRegion,
                            'string'
                        );
                        context.assertOptionalType(
                            `${actionPath}.transitionRegionName`,
                            transitionAction.transitionRegionName,
                            'string'
                        );

                        if (
                            isDefined(transitionAction.options) &&
                            context.assertOptionalType(`${actionPath}.options`, transitionAction.options, 'object')
                        ) {
                            const optsPath = `${actionPath}.options`;
                            const opts = transitionAction.options as Record<string, any>;

                            context.assertOptionalType(`${optsPath}.quantize`, opts.quantize, 'string');
                            context.assertOptionalType(
                                `${optsPath}.crossfadeDuration`,
                                opts.crossfadeDuration,
                                'number'
                            );
                            context.assertOptionalType(`${optsPath}.tailDuration`, opts.tailDuration, 'number');
                            context.assertOptionalType(`${optsPath}.interruptable`, opts.interruptable, 'boolean');

                            if (
                                isDefined(opts.offsetMode) &&
                                context.assertOptionalType(`${optsPath}.offsetMode`, opts.offsetMode, 'string')
                            ) {
                                const mode = opts.offsetMode as string;
                                if (mode !== 'None' && mode !== 'Relative' && mode !== 'Inverted') {
                                    context.addError(
                                        `Action at "${optsPath}.offsetMode" has invalid value "${mode}". Expected 'None', 'Relative', or 'Inverted'.`
                                    );
                                }
                            }
                        }
                        break;
                    }

                    case 'play_stinger': {
                        const stingerAction = action;
                        context.assertRequiredType(`${actionPath}.target`, stingerAction.target, 'string');

                        if (
                            isDefined(stingerAction.quantize) &&
                            context.assertOptionalType(`${actionPath}.quantize`, stingerAction.quantize, 'string')
                        ) {
                            const q = stingerAction.quantize as string;
                            if (q !== 'Immediate' && q !== 'NextBeat' && q !== 'NextBar') {
                                context.addError(
                                    `Action at "${actionPath}.quantize" has invalid value "${q}". Expected 'Immediate', 'NextBeat', or 'NextBar'.`
                                );
                            }
                        }
                        context.assertOptionalType(
                            `${actionPath}.referenceTrackId`,
                            stingerAction.referenceTrackId,
                            'string'
                        );
                        break;
                    }

                    case 'set_mixer_state':
                        context.assertRequiredType(
                            `${actionPath}.snapshotName`,
                            (action as any).snapshotName,
                            'string'
                        );
                        break;

                    case 'add_mixer_modifier': {
                        const addModAction = action;
                        context.assertRequiredType(`${actionPath}.snapshotName`, addModAction.snapshotName, 'string');
                        context.assertRequiredType(`${actionPath}.modifierId`, addModAction.modifierId, 'string');
                        context.assertOptionalType(`${actionPath}.priority`, addModAction.priority, 'number');
                        break;
                    }

                    case 'remove_mixer_modifier':
                        context.assertRequiredType(`${actionPath}.modifierId`, (action as any).modifierId, 'string');
                        break;

                    case 'trigger_event': {
                        const targetId = action.target;

                        if (context.assertRequiredType(`${actionPath}.target`, targetId, 'string')) {
                            if (!context.config.events[targetId]) {
                                context.addError(`Event "${eventId}" references missing event target "${targetId}".`);
                            }

                            if (targetId === (eventId as any)) {
                                context.addError(`Event "${eventId}" references itself in action list.`);
                            }
                        }
                        break;
                    }

                    case 'load_bank':
                    case 'unload_bank': {
                        const targetId = action.target;
                        if (context.assertRequiredType(`${actionPath}.target`, targetId, 'string')) {
                            if (!context.config.banks || !(targetId in context.config.banks)) {
                                context.addError(
                                    `Event "${eventId}" references missing bank "${targetId}" at ${actionPath}.`
                                );
                            }
                        }
                        break;
                    }

                    default:
                        context.addError(`Unknown action type "${actionType}" at ${actionPath}`);
                }
            }
        }
    }
}
