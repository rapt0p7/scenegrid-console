import { describe, it, expect, vi } from 'vitest';

import { ConcurrencyThrottler } from '../ConcurrencyThrottler.js';

function createDeferred<T = void>() {
    // oxlint-disable-next-line typescript/prefer-readonly-parameter-types
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('ConcurrencyThrottler', () => {
    describe('Concurrency Management', () => {
        it('should execute tasks immediately if below concurrency limit', async () => {
            const throttler = new ConcurrencyThrottler<number>(2, 1024);
            let executionCount = 0;

            const task1 = () => {
                executionCount++;
                return Promise.resolve(1);
            };
            const task2 = () => {
                executionCount++;
                return Promise.resolve(2);
            };

            await Promise.all([throttler.enqueue(task1), throttler.enqueue(task2)]);

            expect(executionCount).toBe(2);
        });

        it('should strictly limit active concurrent tasks', async () => {
            const throttler = new ConcurrencyThrottler<string>(2, 1024);

            const def1 = createDeferred<string>();
            const def2 = createDeferred<string>();
            const def3 = createDeferred<string>();

            const spy1 = vi.fn(() => def1.promise);
            const spy2 = vi.fn(() => def2.promise);
            const spy3 = vi.fn(() => def3.promise);

            void throttler.enqueue(spy1);
            void throttler.enqueue(spy2);
            void throttler.enqueue(spy3);

            // oxlint-disable-next-line no-promise-executor-return
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(spy1).toHaveBeenCalledTimes(1);
            expect(spy2).toHaveBeenCalledTimes(1);
            expect(spy3).not.toHaveBeenCalled();

            def1.resolve('done 1');
            // oxlint-disable-next-line no-promise-executor-return typescript/strict-void-return
            await new Promise(resolve => setTimeout(resolve, 0));

            expect(spy3).toHaveBeenCalledTimes(1);
        });
    });

    describe('Return Values & Error Handling', () => {
        it('should accurately propagate resolved values to the caller', async () => {
            const throttler = new ConcurrencyThrottler<number>(1, 1024);

            const result = await throttler.enqueue(async () => {
                return 42;
            });

            expect(result).toBe(42);
        });

        it('should correctly propagate errors and continue processing the queue', async () => {
            const throttler = new ConcurrencyThrottler<string>(1, 1024);

            // oxlint-disable-next-line unicorn/consistent-function-scoping require-await
            const failingTask = async () => {
                throw new Error('Decode failed');
            };
            // oxlint-disable-next-line unicorn/consistent-function-scoping require-await
            const successTask = async () => 'Success';

            await expect(throttler.enqueue(failingTask)).rejects.toThrow('Decode failed');

            const nextResult = await throttler.enqueue(successTask);
            expect(nextResult).toBe('Success');
        });
    });

    describe('Ring Buffer (Zero-Allocation) Integrity', () => {
        it('should safely wrap around head and tail pointers when handling tasks beyond internal capacity over time', async () => {
            const CAPACITY = 16;
            const throttler = new ConcurrencyThrottler<number>(2, CAPACITY);

            let completedCount = 0;

            const runBatch = async (startOffset: number, count: number) => {
                const tasks = Array.from({ length: count }).map(async (_, index) => {
                    return throttler.enqueue(async () => {
                        // oxlint-disable-next-line no-promise-executor-return typescript/strict-void-return
                        await new Promise(resolve => setTimeout(resolve, 1));
                        completedCount++;
                        return startOffset + index;
                    });
                });
                return Promise.all(tasks);
            };

            for (let i = 0; i < 5; i++) {
                // oxlint-disable-next-line no-await-in-loop
                const results = await runBatch(i * 10, 10);
                expect(results.length).toBe(10);
            }

            expect(completedCount).toBe(50);
        });

        it('should throw an error if enqueued tasks exceed the absolute capacity instantly', async () => {
            const throttler = new ConcurrencyThrottler<number>(2, 4);

            // oxlint-disable-next-line no-promise-executor-return require-await typescript/strict-void-return
            void throttler.enqueue(async () => new Promise(res => setTimeout(res, 50)));
            // oxlint-disable-next-line no-promise-executor-return require-await typescript/strict-void-return
            void throttler.enqueue(async () => new Promise(res => setTimeout(res, 50)));

            void throttler.enqueue(async () => 3);
            void throttler.enqueue(async () => 4);
            void throttler.enqueue(async () => 5);
            void throttler.enqueue(async () => 6);

            await expect(throttler.enqueue(async () => 7)).rejects.toThrow(
                'ConcurrencyThrottler queue capacity exceeded'
            );
        });
    });
});
