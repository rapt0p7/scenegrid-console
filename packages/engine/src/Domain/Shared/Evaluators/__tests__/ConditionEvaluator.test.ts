// noinspection D
import { describe, it, expect } from 'vitest';

import { ConditionEvaluator } from '@domain/Shared/Evaluators/ConditionEvaluator.js';
import type { ConditionOperator } from '@scene-grid/shared';

describe('ConditionEvaluator', () => {
    describe('Raw Evaluation (hysteresis = 0)', () => {
        // oxlint-disable-next-line unicorn/consistent-function-scoping
        const runRawTest = (operator: ConditionOperator, actual: number, target: number, expected: boolean) => {
            expect(ConditionEvaluator.evaluate(actual, operator, target, 0)).toBe(expected);
            expect(ConditionEvaluator.evaluate(actual, operator, target)).toBe(expected);
        };

        it('should correctly evaluate ">" (Greater Than)', () => {
            runRawTest('>', 50, 40, true);
            runRawTest('>', 40, 50, false);
            runRawTest('>', 50, 50, false);
        });

        it('should correctly evaluate "<" (Less Than)', () => {
            runRawTest('<', 30, 40, true);
            runRawTest('<', 50, 40, false);
            runRawTest('<', 40, 40, false);
        });

        it('should correctly evaluate ">=" (Greater Than or Equal)', () => {
            runRawTest('>=', 50, 40, true);
            runRawTest('>=', 50, 50, true);
            runRawTest('>=', 40, 50, false);
        });

        it('should correctly evaluate "<=" (Less Than or Equal)', () => {
            runRawTest('<=', 40, 50, true);
            runRawTest('<=', 50, 50, true);
            runRawTest('<=', 60, 50, false);
        });

        it('should correctly evaluate "==" (Equal)', () => {
            runRawTest('==', 50, 50, true);
            runRawTest('==', 50, 40, false);
        });

        it('should correctly evaluate "!=" (Not Equal)', () => {
            runRawTest('!=', 50, 40, true);
            runRawTest('!=', 50, 50, false);
        });
    });

    describe('Hysteresis / Schmitt Trigger (hysteresis > 0)', () => {
        const TARGET = 100;
        const HYST = 20;

        describe('Operator: ">" and ">="', () => {
            it('requires breaking the UPPER bound when NOT previously met', () => {
                expect(ConditionEvaluator.evaluate(119, '>', TARGET, HYST, false)).toBe(false);
                expect(ConditionEvaluator.evaluate(120, '>', TARGET, HYST, false)).toBe(true);

                expect(ConditionEvaluator.evaluate(119, '>=', TARGET, HYST, false)).toBe(false);
                expect(ConditionEvaluator.evaluate(120, '>=', TARGET, HYST, false)).toBe(true);
            });

            it('requires falling below the LOWER bound to reset when PREVIOUSLY met', () => {
                expect(ConditionEvaluator.evaluate(80, '>', TARGET, HYST, true)).toBe(true);
                expect(ConditionEvaluator.evaluate(79, '>', TARGET, HYST, true)).toBe(false);

                expect(ConditionEvaluator.evaluate(80, '>=', TARGET, HYST, true)).toBe(true);
                expect(ConditionEvaluator.evaluate(79, '>=', TARGET, HYST, true)).toBe(false);
            });
        });

        describe('Operator: "<" and "<="', () => {
            it('requires breaking the LOWER bound when NOT previously met', () => {
                expect(ConditionEvaluator.evaluate(81, '<', TARGET, HYST, false)).toBe(false);
                expect(ConditionEvaluator.evaluate(80, '<', TARGET, HYST, false)).toBe(true);

                expect(ConditionEvaluator.evaluate(81, '<=', TARGET, HYST, false)).toBe(false);
                expect(ConditionEvaluator.evaluate(80, '<=', TARGET, HYST, false)).toBe(true);
            });

            it('requires exceeding the UPPER bound to reset when PREVIOUSLY met', () => {
                expect(ConditionEvaluator.evaluate(120, '<', TARGET, HYST, true)).toBe(true);
                expect(ConditionEvaluator.evaluate(121, '<', TARGET, HYST, true)).toBe(false);

                expect(ConditionEvaluator.evaluate(120, '<=', TARGET, HYST, true)).toBe(true);
                expect(ConditionEvaluator.evaluate(121, '<=', TARGET, HYST, true)).toBe(false);
            });
        });

        describe('Operator: "==" (In-Zone Check)', () => {
            it('returns true ONLY if value is strictly within the dead zone [lower, upper]', () => {
                expect(ConditionEvaluator.evaluate(80, '==', TARGET, HYST)).toBe(true);
                expect(ConditionEvaluator.evaluate(100, '==', TARGET, HYST)).toBe(true);
                expect(ConditionEvaluator.evaluate(120, '==', TARGET, HYST)).toBe(true);

                expect(ConditionEvaluator.evaluate(79, '==', TARGET, HYST)).toBe(false);
                expect(ConditionEvaluator.evaluate(121, '==', TARGET, HYST)).toBe(false);
            });
        });

        describe('Operator: "!=" (Out-of-Zone Check)', () => {
            it('returns true ONLY if value is strictly outside the dead zone', () => {
                expect(ConditionEvaluator.evaluate(79, '!=', TARGET, HYST)).toBe(true);
                expect(ConditionEvaluator.evaluate(121, '!=', TARGET, HYST)).toBe(true);

                expect(ConditionEvaluator.evaluate(80, '!=', TARGET, HYST)).toBe(false);
                expect(ConditionEvaluator.evaluate(100, '!=', TARGET, HYST)).toBe(false);
                expect(ConditionEvaluator.evaluate(120, '!=', TARGET, HYST)).toBe(false);
            });
        });
    });

    describe('Exhaustive Checks and Edge Cases', () => {
        it('should hit the default exhaustive switch branch and return false for unknown operator (Raw Mode)', () => {
            const result = ConditionEvaluator.evaluate(50, 'UNKNOWN_OP' as any, 50, 0);
            expect(result).toBe(false);
        });

        it('should hit the default exhaustive switch branch and return false for unknown operator (Hysteresis Mode)', () => {
            const result = ConditionEvaluator.evaluate(50, 'UNKNOWN_OP' as any, 50, 10);
            expect(result).toBe(false);
        });

        it('should correctly default previouslyMet to false if omitted during hysteresis evaluation', () => {
            expect(ConditionEvaluator.evaluate(110, '>', 100, 20)).toBe(false);
        });
    });
});
