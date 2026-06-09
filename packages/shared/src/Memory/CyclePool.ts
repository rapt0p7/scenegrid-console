export class CyclePool<T> {
    private readonly buffer: T[];
    private readonly mask: number;
    private cursor: number = 0;

    constructor(requestedCapacity: number, factory: () => T) {
        const capacity = Math.pow(2, Math.ceil(Math.log2(Math.max(2, requestedCapacity))));
        this.mask = capacity - 1;

        // oxlint-disable-next-line unicorn/no-new-array
        this.buffer = new Array<T>(capacity);
        for (let i = 0; i < capacity; i++) {
            this.buffer[i] = factory();
        }
    }

    getNext(): T {
        const item = this.buffer[this.cursor & this.mask];
        this.cursor++;
        return item;
    }
}
