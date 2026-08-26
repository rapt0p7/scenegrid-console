import { describe, it, expect } from 'vitest';

import deepFreeze from '../deepFreeze.js';

describe('deepFreeze', () => {
    it('should freeze a simple flat object', () => {
        const obj = { a: 1, b: 'string', c: false };
        const frozen = deepFreeze(obj);

        expect(Object.isFrozen(frozen)).toBe(true);
        expect(frozen).toBe(obj);
    });

    it('should recursively freeze nested objects', () => {
        const obj = {
            nested: {
                doubleNested: {
                    value: 42
                }
            }
        };

        deepFreeze(obj);

        expect(Object.isFrozen(obj)).toBe(true);
        expect(Object.isFrozen(obj.nested)).toBe(true);
        expect(Object.isFrozen(obj.nested.doubleNested)).toBe(true);
    });

    it('should handle null values without throwing', () => {
        const obj = { a: null };

        expect(() => deepFreeze(obj)).not.toThrow();
        expect(Object.isFrozen(obj)).toBe(true);
    });

    it('should ignore primitive values and avoid infinite recursion', () => {
        const obj = {
            str: 'hello',
            num: 100,
            bool: true,
            undef: undefined
        };

        expect(() => deepFreeze(obj)).not.toThrow();
        expect(Object.isFrozen(obj)).toBe(true);
    });

    it('should NOT deeply freeze nested functions', () => {
        const obj = {
            fn: () => 'test'
        };

        deepFreeze(obj);

        expect(Object.isFrozen(obj)).toBe(true);
        expect(Object.isFrozen(obj.fn)).toBe(false);
    });

    it('should handle correctly mixed frozen and unfrozen nested objects', () => {
        const alreadyFrozen = Object.freeze({ x: 1 });
        const notFrozen = { y: 2 };

        const obj = {
            a: alreadyFrozen,
            b: notFrozen
        };

        deepFreeze(obj);

        expect(Object.isFrozen(obj)).toBe(true);
        expect(Object.isFrozen(obj.b)).toBe(true);
    });

    it('should correctly process arrays', () => {
        const arr = [1, { a: 2 }];
        deepFreeze(arr);

        expect(Object.isFrozen(arr)).toBe(true);
        expect(Object.isFrozen(arr[1])).toBe(true);
    });
});
