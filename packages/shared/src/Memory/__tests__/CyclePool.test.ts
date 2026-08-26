// oxlint-disable import/no-named-as-default-member
// noinspection D

import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, expect, vi } from 'vitest';

import { CyclePool } from '../CyclePool.js';

const getExpectedCapacity = (requested: number) => {
    return Math.pow(2, Math.ceil(Math.log2(Math.max(2, requested))));
};

describe('CyclePool (Property-Based Mutant Assassins)', () => {
    test.prop([fc.integer({ min: 2, max: 2048 })])(
        'should increment the cursor forward to cycle through the buffer sequentially (Line 19)',
        requestedCapacity => {
            let counter = 0;
            const pool = new CyclePool(requestedCapacity, () => counter++);

            const actualCapacity = getExpectedCapacity(requestedCapacity);

            for (let i = 0; i < actualCapacity + 2; i++) {
                expect(pool.getNext()).toBe(i % actualCapacity);
            }
        }
    );

    test.prop([fc.integer({ min: 2, max: 2048 })])(
        'should initialize exactly `capacity` number of items, preventing out-of-bounds allocation (Line 12)',
        requestedCapacity => {
            const factorySpy = vi.fn(() => ({}));

            // oxlint-disable-next-line no-new
            new CyclePool(requestedCapacity, factorySpy);

            const actualCapacity = getExpectedCapacity(requestedCapacity);

            expect(factorySpy).toHaveBeenCalledTimes(actualCapacity);
        }
    );

    test.prop([fc.integer({ min: 2, max: 2048 })])(
        'should pre-allocate the buffer array to the exact capacity to prevent dynamic resizing (Line 11)',
        requestedCapacity => {
            const OriginalArray = globalThis.Array;
            let interceptedCapacity = -1;

            const ArrayProxy = new Proxy(OriginalArray, {
                construct(target, args) {
                    if (args.length === 1 && typeof args[0] === 'number') {
                        interceptedCapacity = args[0];
                    } else if (args.length === 0) {
                        interceptedCapacity = 0;
                    }
                    return new (target as any)(...args);
                }
            });

            globalThis.Array = ArrayProxy;

            try {
                // oxlint-disable-next-line no-new
                new CyclePool(requestedCapacity, () => ({}));

                const actualCapacity = getExpectedCapacity(requestedCapacity);

                expect(interceptedCapacity).toBe(actualCapacity);
            } finally {
                globalThis.Array = OriginalArray;
            }
        }
    );
});
