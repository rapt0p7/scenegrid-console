import type { ConditionOperator } from '@domain/Shared/Types/Condition.js';

// oxlint-disable-next-line typescript/no-extraneous-class
export class ConditionEvaluator {
    public static evaluate(actualValue: number, operator: ConditionOperator, targetValue: number): boolean {
        switch (operator) {
            case '>':
                return actualValue > targetValue;
            case '<':
                return actualValue < targetValue;
            case '>=':
                return actualValue >= targetValue;
            case '<=':
                return actualValue <= targetValue;
            case '==':
                return actualValue === targetValue;
            case '!=':
                return actualValue !== targetValue;
            default: {
                // oxlint-disable-next-line typescript/no-unsafe-assignment
                // noinspection JSUnusedLocalSymbols
                // eslint-disable-next-line @typescript-eslint/naming-convention
                const _exhaustiveCheck: never = operator;
                return false;
            }
        }
    }
}
