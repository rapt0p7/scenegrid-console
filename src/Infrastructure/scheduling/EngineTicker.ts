import * as workerTimers from 'worker-timers';

import type { IEngineTicker } from '@domain/Shared/Ports/IEngineTicker.js';
import { TickerTaskId } from '@shared/Types/Branded.js';
import { ITickable } from '@domain/Shared/Ports/ITickable.js';

interface TickerTask {
    id: TickerTaskId;
    target: ITickable;
    intervalMs: number;
    accumulator: number;
}

export class EngineTicker implements IEngineTicker {
    private tickerId: number | null = null;
    private lastTickTime: number = 0;
    private readonly tasks: TickerTask[] = [];
    private readonly BASE_TICK_RATE = 15;

    constructor(private readonly getContextTime: () => number) {}

    public start(): void {
        if (this.tickerId !== null) return;

        this.lastTickTime = performance.now();
        this.tickerId = workerTimers.setInterval(() => {
            this.tick();
        }, this.BASE_TICK_RATE);
    }

    public stop(): void {
        if (this.tickerId !== null) {
            workerTimers.clearInterval(this.tickerId);
            this.tickerId = null;
        }
    }

    public add(id: TickerTaskId, intervalMs: number, target: ITickable): void {
        if (this.tasks.some(t => t.id === id)) return;

        this.tasks.push({ id, target, intervalMs, accumulator: 0 });
    }

    public remove(id: TickerTaskId): void {
        const index = this.tasks.findIndex(t => t.id === id);

        if (index !== -1) {
            this.tasks[index] = this.tasks[this.tasks.length - 1];
            this.tasks.pop();
        }
    }

    private tick(): void {
        const now = performance.now();
        const deltaTimeMs = now - this.lastTickTime;
        this.lastTickTime = now;

        const audioCurrentTime = this.getContextTime();

        const length = this.tasks.length;

        for (let i = 0; i < length; i++) {
            const task = this.tasks[i];
            task.accumulator += deltaTimeMs;

            if (task.accumulator >= task.intervalMs) {
                task.accumulator %= task.intervalMs;
                task.target.tick(audioCurrentTime, deltaTimeMs);
            }
        }
    }
}
