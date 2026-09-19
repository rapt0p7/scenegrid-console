// noinspection D

import type { IValidationContext } from '@domain/Validation/Ports/IValidationContext.js';
import type { IValidationRule } from '@domain/Validation/Ports/IValidationRule.js';

import { isAbsent, isDefined, typedKeys } from '@scene-grid/shared';

export default class RoutingCyclesRule implements IValidationRule {
    public validate(context: IValidationContext) {
        if (isAbsent(context.config.buses)) return;

        const visited = new Set<string>();
        const visiting = new Set<string>();
        const path: string[] = [];

        const dfs = (busId: string) => {
            if (visiting.has(busId)) {
                const cycleStartIndex = path.indexOf(busId);
                const cycle = path.slice(cycleStartIndex);
                cycle.push(busId);

                context.addError(`Fatal Error: Audio routing loop detected in configuration: ${cycle.join(' -> ')}`);
                return;
            }

            if (visited.has(busId)) return;

            visiting.add(busId);
            path.push(busId);

            const sends = context.config.buses[busId]?.sends;
            if (isDefined(sends)) {
                for (const targetBus of typedKeys(sends)) {
                    if (isDefined(context.config.buses[targetBus])) {
                        dfs(targetBus);
                    }
                }
            }

            path.pop();
            visiting.delete(busId);
            visited.add(busId);
        };

        for (const busId of Object.keys(context.config.buses)) {
            if (!visited.has(busId)) {
                dfs(busId);
            }
        }
    }
}
