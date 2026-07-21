// noinspection D

import type { IComponentValidationRule } from '@domain/Validation/Ports//IComponentValidationRule.js';
import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import { isAbsent, isDefined } from '@scene-grid/shared';

export default class ContainerSourcesRule implements IComponentValidationRule<unknown> {
    public validate(context: IValidationContext, path: string, sources: unknown): void {
        if (!context.assertArray(`${path}.sources`, sources, false)) return;

        const sourcesArray = sources as readonly unknown[];
        if (sourcesArray.length === 0) {
            context.addError(`"${path}.sources" cannot be empty.`);
            return;
        }

        for (const [index, source] of sourcesArray.entries()) {
            const itemPath = `${path}.sources[${index}]`;

            if (isAbsent(source)) {
                context.addError(`Source item at "${itemPath}" is undefined or null.`);
                continue;
            }

            let targetId = '';

            if (typeof source === 'string') {
                targetId = source;
            } else if (typeof source === 'object') {
                if (context.assertRequiredType(itemPath, source, 'object')) {
                    const obj = source as Record<string, unknown>;
                    if (context.assertRequiredType(`${itemPath}.id`, obj.id, 'string')) {
                        targetId = obj.id as string;
                    }
                    if (isDefined(obj.weight)) {
                        if (context.assertRequiredType(`${itemPath}.weight`, obj.weight, 'number')) {
                            if ((obj.weight as number) <= 0) {
                                context.addError(`Weight at "${itemPath}.weight" must be > 0.`);
                            }
                        }
                    }
                }
            } else {
                context.addError(
                    `Invalid source item type at "${itemPath}". Expected string or { id: string, weight?: number }`
                );
                continue;
            }

            if (targetId && !context.config.manifest[targetId as any] && !context.config.soundMap[targetId as any]) {
                context.addWarning(`Source item at "${itemPath}" references missing sound "${targetId}".`);
            }
        }
    }
}
