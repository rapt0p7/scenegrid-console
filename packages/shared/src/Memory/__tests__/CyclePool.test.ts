// oxlint-disable import/no-named-as-default-member
// noinspection D

import { describe, expect, vi, it } from 'vitest';

import { CyclePool } from '../CyclePool.js';

const getExpectedCapacity = (requested: number) => {
    return Math.pow(2, Math.ceil(Math.log2(Math.max(2, requested))));
};

describe('CyclePool (Property-Based Mutant Assassins)', () => {
    it('should increment the cursor forward to cycle through the buffer sequentially (Line 19)', () => {
        let counter = 0;
        const requestedCapacity = 4;
        const pool = new CyclePool(requestedCapacity, () => counter++);

        const actualCapacity = getExpectedCapacity(requestedCapacity);

        for (let i = 0; i < actualCapacity + 2; i++) {
            expect(pool.getNext()).toBe(i % actualCapacity);
        }
    });

    it('should initialize exactly `capacity` number of items, preventing out-of-bounds allocation (Line 12)', () => {
        const factorySpy = vi.fn(() => ({}));
        const requestedCapacity = 4;

        // oxlint-disable-next-line no-new
        new CyclePool(requestedCapacity, factorySpy);

        const actualCapacity = getExpectedCapacity(requestedCapacity);

        expect(factorySpy).toHaveBeenCalledTimes(actualCapacity);
    });

    it('should pre-allocate the buffer array to the exact capacity to prevent dynamic resizing (Line 11)', () => {
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
        const requestedCapacity = 4;

        try {
            // oxlint-disable-next-line no-new
            new CyclePool(requestedCapacity, () => ({}));

            const actualCapacity = getExpectedCapacity(requestedCapacity);

            expect(interceptedCapacity).toBe(actualCapacity);
        } finally {
            globalThis.Array = OriginalArray;
        }
    });
});
