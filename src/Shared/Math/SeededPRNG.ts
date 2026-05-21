export interface IPRNG {
    next(): number;
    nextRange(min: number, max: number): number;
}

export class SeededPRNG implements IPRNG {
    private state: number;

    constructor(seed: number) {
        this.state = seed === 0 ? 1 : seed;
    }

    public next(): number {
        this.state = Math.trunc(this.state * 1664525 + 1013904223);
        return this.state / 4294967296;
    }

    public nextRange(min: number, max: number): number {
        return min + this.next() * (max - min);
    }
}
