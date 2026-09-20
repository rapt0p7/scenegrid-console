import type { IEngineTicker } from '@domain/Shared/Ports/IEngineTicker.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { ContextTime, Milliseconds, TickerTaskId } from '@scene-grid/shared';

import * as workerTimers from 'worker-timers';

interface TickerTask {
    readonly id: TickerTaskId;
    readonly target: ITickable;
    readonly divider: number;
    lastRunTime: number;
}

export class EngineTicker implements IEngineTicker {
    private tickerId: number | null = null;
    private readonly tasks: TickerTask[] = [];
    private currentTick: number = 0;
    private readonly BASE_TICK_RATE: Milliseconds = 10 as Milliseconds;

    constructor(private readonly getContextTime: () => ContextTime) {}

    public add(id: TickerTaskId, divider: number, target: ITickable): void {
        if (this.tasks.some(t => t.id === id)) return;
        const safeDivider = Math.max(1, Math.round(divider));

        this.tasks.push({
            id,
            divider: safeDivider,
            target,
            lastRunTime: performance.now()
        });
    }

    public remove(id: string): void {
        const index = this.tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            this.tasks[index] = this.tasks[this.tasks.length - 1];
            this.tasks.pop();
        }
    }

    public start(): void {
        if (this.tickerId !== null) return;

        this.currentTick = 0;

        const now = performance.now();
        for (let i = 0; i < this.tasks.length; i++) {
            this.tasks[i].lastRunTime = now;
        }

        this.tickerId = workerTimers.setInterval(() => {
            this.onTick();
        }, this.BASE_TICK_RATE);
    }

    public stop(): void {
        if (this.tickerId !== null) {
            workerTimers.clearInterval(this.tickerId);
            this.tickerId = null;
        }
    }

    private onTick(): void {
        this.currentTick++;
        if (this.tasks.length === 0) return;

        const currentContextTime = this.getContextTime();
        const now = performance.now();

        for (let i = 0; i < this.tasks.length; i++) {
            const task = this.tasks[i];
            if (!task) continue;

            if (this.currentTick % task.divider === 0) {
                const physicalDeltaTime = (now - task.lastRunTime) as Milliseconds;
                task.lastRunTime = now;
                task.target.tick(currentContextTime, physicalDeltaTime);
            }
        }
    }
}
