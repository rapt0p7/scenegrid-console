export function typedEntries<T extends object>(obj: T): Array<[keyof T, T[keyof T]]> {
    return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
}

export function typedKeys<T extends object>(obj: T): Array<keyof T> {
    return Object.keys(obj) as Array<keyof T>;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function typedFromEntries<K extends PropertyKey, V>(entries: Iterable<readonly [K, V]>): Record<K, V> {
    return Object.fromEntries(entries) as Record<K, V>;
}
