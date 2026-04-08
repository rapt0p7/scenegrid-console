export function isDefined<T>(value: T | null | undefined): value is T {
    return value !== undefined && value !== null;
}

export function isAbsent(value: unknown): value is null | undefined {
    return value === undefined || value === null;
}

export function isNumber(value: unknown): value is number {
    return typeof value === 'number' && !Number.isNaN(value);
}
