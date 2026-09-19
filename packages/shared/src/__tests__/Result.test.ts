import { expect, test, describe } from 'vitest';

import type { Result, Ok, Err } from '../Types/Result.js';

describe('Result Monad', () => {
    test('Ok should be properly narrowed', () => {
        const result: Result<number, string> = { ok: true, value: 42 };

        if (result.ok) {
            expect(result.value).toBe(42);
        } else {
            expect.unreachable('Should be Ok');
        }
    });

    test('Err should be properly narrowed', () => {
        const result: Result<number, string> = { ok: false, error: 'failed' };

        if (result.ok) {
            expect.unreachable('Should be Err');
        } else {
            expect(result.error).toBe('failed');
        }
    });

    test('Type checks', () => {
        const okVal: Ok<number> = { ok: true, value: 1 };
        const errVal: Err<string> = { ok: false, error: 'err' };

        expect(okVal.ok).toBe(true);
        expect(errVal.ok).toBe(false);
    });
});
