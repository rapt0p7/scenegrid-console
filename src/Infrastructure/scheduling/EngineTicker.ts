import * as workerTimers from 'worker-timers';

interface TickerTask {
    id: string;
    callback: (currentTime: number, deltaTimeMs: number) => void;
    intervalMs: number;
    accumulator: number;
}

export class EngineTicker {
    private tickerId: number | null = null;
    private lastTickTime: number = 0;
    private readonly tasks: Map<string, TickerTask> = new Map();
    private readonly BASE_TICK_RATE = 15;

    constructor(private readonly getContextTime: () => number) {}

    public start(): void {
        if (this.tickerId !== null) return;

        this.lastTickTime = performance.now();
        this.tickerId = workerTimers.setInterval(() => this.tick(), this.BASE_TICK_RATE);
    }

    public stop(): void {
        if (this.tickerId !== null) {
            workerTimers.clearInterval(this.tickerId);
            this.tickerId = null;
        }
    }

    public add(id: string, intervalMs: number, callback: (currentTime: number, deltaTimeMs: number) => void): void {
        this.tasks.set(id, { id, callback, intervalMs, accumulator: 0 });
    }

    public remove(id: string): void {
        this.tasks.delete(id);
    }

    private tick(): void {
        const now = performance.now();
        const deltaTimeMs = now - this.lastTickTime;
        this.lastTickTime = now;

        const audioCurrentTime = this.getContextTime();

        for (const task of this.tasks.values()) {
            task.accumulator += deltaTimeMs;

            if (task.accumulator >= task.intervalMs) {
                task.accumulator -= task.intervalMs;
                task.callback(audioCurrentTime, deltaTimeMs);
            }
        }
    }
}
