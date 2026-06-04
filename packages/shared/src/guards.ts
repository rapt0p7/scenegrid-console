/**
 * Returns whether a value is neither `null` nor `undefined`.
 *
 * Useful when filtering nullable collections while preserving the narrowed type.
 *
 * @param value The value to check.
 * @returns `true` when the value is present.
 */
export function isDefined<T>(value: T | null | undefined): value is T {
    return value !== undefined && value !== null;
}

/**
 * Returns whether a value is `null` or `undefined`.
 *
 * @param value The value to check.
 * @returns `true` when the value is absent.
 */
export function isAbsent(value: unknown): value is null | undefined {
    return value === undefined || value === null;
}

/**
 * Returns whether a value is a valid JavaScript number.
 *
 * This guard excludes `NaN`.
 *
 * @param value The value to check.
 * @returns `true` when the value is a number and not `NaN`.
 */
export function isNumber(value: unknown): value is number {
    return typeof value === 'number' && !Number.isNaN(value);
}
