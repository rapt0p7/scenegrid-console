export class ConcurrencyThrottler<T> {
    private readonly pendingResolvers: Array<() => void>;
    private readonly mask: number;
    private head = 0;
    private tail = 0;
    private activeCount = 0;

    constructor(
        private limit: number,
        maxQueueSize: number
    ) {
        const capacity = Math.pow(2, Math.ceil(Math.log2(Math.max(2, maxQueueSize))));
        this.mask = capacity - 1;
        // oxlint-disable-next-line unicorn/no-new-array typescript/no-unsafe-assignment
        this.pendingResolvers = new Array(capacity);
    }

    public async enqueue(task: () => Promise<T>): Promise<T> {
        if (this.tail - this.head >= this.pendingResolvers.length) {
            throw new Error(`ConcurrencyThrottler queue capacity exceeded (${this.pendingResolvers.length})`);
        }

        if (this.activeCount >= this.limit) {
            await new Promise<void>(resolve => {
                this.pendingResolvers[this.tail & this.mask] = resolve;
                this.tail++;
            });
        }

        this.activeCount++;
        try {
            return await task();
        } finally {
            this.activeCount--;
            if (this.head < this.tail) {
                const nextResolve = this.pendingResolvers[this.head & this.mask];
                // oxlint-disable-next-line typescript/no-unsafe-assignment typescript/no-unsafe-type-assertion
                this.pendingResolvers[this.head & this.mask] = undefined as any;
                this.head++;
                nextResolve();
            }
        }
    }
}
