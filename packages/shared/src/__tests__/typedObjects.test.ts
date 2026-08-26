import { describe, expect, expectTypeOf, it } from 'vitest';

import { typedEntries, typedFromEntries, typedKeys } from '../typedObjects.js';

describe('typedEntries', () => {
    it('returns entries', () => {
        const object = {
            name: 'John',
            age: 30
        };

        expect(typedEntries(object)).toEqual([
            ['name', 'John'],
            ['age', 30]
        ]);
    });

    it('preserves key-value relation in the type', () => {
        const object = {
            name: 'John',
            age: 30
        };

        const entries = typedEntries(object);

        expectTypeOf(entries).toEqualTypeOf<(['name', string] | ['age', number])[]>();
    });

    it('returns an empty array for an empty object', () => {
        expect(typedEntries({})).toEqual([]);
    });

    it('works with optional properties', () => {
        const object: {
            name: string;
            age?: number;
        } = {
            name: 'John'
        };

        expect(typedEntries(object)).toEqual([['name', 'John']]);
    });
});

describe('typedKeys', () => {
    it('returns keys', () => {
        const object = {
            name: 'John',
            age: 30
        };

        expect(typedKeys(object)).toEqual(['name', 'age']);
    });

    it('preserves keys in the type', () => {
        const object = {
            name: 'John',
            age: 30
        };

        const keys = typedKeys(object);

        expectTypeOf(keys).toEqualTypeOf<('name' | 'age')[]>();
    });

    it('returns an empty array for an empty object', () => {
        expect(typedKeys({})).toEqual([]);
    });

    it('returns only own enumerable properties', () => {
        const prototype = {
            inherited: 'value'
        };

        const object = Object.create(prototype) as {
            own: string;
        };

        object.own = 'value';

        expect(typedKeys(object)).toEqual(['own']);
    });
});

describe('typedFromEntries', () => {
    it('creates an object from entries', () => {
        const entries: [string, string | number][] = [
            ['name', 'John'],
            ['age', 30]
        ];

        expect(typedFromEntries(entries)).toEqual({
            name: 'John',
            age: 30
        });
    });

    it('preserves keys and values in the type', () => {
        const entries: ['name', string][] | ['age', number][] = [['name', 'John']];

        const result = typedFromEntries(entries);

        expectTypeOf(result).toEqualTypeOf<{
            name: string;
        }>();
    });

    it('returns an empty object for empty entries', () => {
        expect(typedFromEntries([])).toEqual({});
    });

    it('uses the last value for duplicate keys', () => {
        const entries: ['name', string][] = [
            ['name', 'John'],
            ['name', 'Jane']
        ];

        expect(typedFromEntries(entries)).toEqual({
            name: 'Jane'
        });
    });

    it('works with numeric keys', () => {
        const entries: [number, string][] = [
            [1, 'one'],
            [2, 'two']
        ];

        expect(typedFromEntries(entries)).toEqual({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            1: 'one',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            2: 'two'
        });
    });

    it('works with symbol keys', () => {
        const key = Symbol('key');
        const entries: [typeof key, string][] = [[key, 'value']];

        const result = typedFromEntries(entries);

        expect(result).toEqual({
            [key]: 'value'
        });
    });
});
