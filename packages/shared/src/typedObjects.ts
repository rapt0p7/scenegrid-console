type KeyValuePair = [PropertyKey, unknown];

type EntriesOf<T> = Required<{
    [K in keyof T]: [K, T[K]];
}>[keyof T][];

type ObjectFromEntries<T> = T extends readonly [infer Key extends PropertyKey, infer Value][]
    ? { [key in Key]: Value }
    : never;

export function typedEntries<const T extends object>(obj: T): EntriesOf<T> {
    return Object.entries(obj) as EntriesOf<T>;
}

export function typedKeys<const T extends object>(obj: T): (keyof typeof obj)[] {
    return Object.keys(obj) as (keyof typeof obj)[];
}

export function typedFromEntries<const T extends KeyValuePair>(entries: T[]): ObjectFromEntries<T[]> {
    return Object.fromEntries(entries) as ObjectFromEntries<T[]>;
}
