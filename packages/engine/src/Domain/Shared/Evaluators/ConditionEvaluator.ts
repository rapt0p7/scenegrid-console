import type { ConditionOperator } from '@scene-grid/shared';

// oxlint-disable-next-line typescript/no-extraneous-class
export class ConditionEvaluator {
    public static evaluate(
        actualValue: number,
        operator: ConditionOperator,
        targetValue: number,
        hysteresis: number = 0,
        previouslyMet: boolean = false
    ): boolean {
        if (hysteresis === 0) {
            return this.evaluateRaw(actualValue, operator, targetValue);
        }

        const lowerBound = targetValue - hysteresis;
        const upperBound = targetValue + hysteresis;

        switch (operator) {
            case '>':
            case '>=':
                return previouslyMet ? actualValue >= lowerBound : actualValue >= upperBound;

            case '<':
            case '<=':
                return previouslyMet ? actualValue <= upperBound : actualValue <= lowerBound;

            case '==':
                return actualValue >= lowerBound && actualValue <= upperBound;

            case '!=':
                return actualValue < lowerBound || actualValue > upperBound;

            default: {
                // noinspection JSUnusedLocalSymbols
                // oxlint-disable-next-line no-underscore-dangle
                // eslint-disable-next-line
                const _exhaustiveCheck: never = operator;
                return false;
            }
        }
    }

    private static evaluateRaw(actualValue: number, operator: ConditionOperator, targetValue: number): boolean {
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
                // noinspection JSUnusedLocalSymbols
                // oxlint-disable-next-line no-underscore-dangle
                // eslint-disable-next-line
                const _exhaustiveCheck: never = operator;
                return false;
            }
        }
    }
}
