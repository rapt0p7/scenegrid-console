import mitt from 'mitt';
import * as workerTimers from 'worker-timers';

import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter';
import type { IRTPCManager, RTPCEvents } from '@kernel/RTPC/Ports/IRTPCManager.js';
import type { Emitter } from 'mitt';

const MAX_PARAMS = 1024;

export default class RTPCManager implements IRTPCManager, IRTPCAdapter {
    public readonly events: Emitter<RTPCEvents> = mitt<RTPCEvents>();

    private paramToIndex = new Map<string, number>();
    private indexToParam: string[] = Array.from({ length: MAX_PARAMS });
    private nextFreeIndex = 0;

    private current = new Float32Array(MAX_PARAMS);
    private target = new Float32Array(MAX_PARAMS);
    private attack = new Float32Array(MAX_PARAMS);
    private release = new Float32Array(MAX_PARAMS);

    private dirtyIndices = new Uint16Array(MAX_PARAMS);
    private inDirtyList = new Uint8Array(MAX_PARAMS);
    private dirtyCount = 0;

    private isUpdateScheduled = false;
    private tickerId: ReturnType<typeof workerTimers.setInterval> | null = null;
    private lastTime = 0;
    private readonly TICK_RATE_MS = 30;

    public configureParam(name: string, attackMs: number = 0, releaseMs: number = 0): void {
        const index = this.getParamIndex(name);
        this.attack[index] = attackMs;
        this.release[index] = releaseMs;
    }

    public setValue(name: string, value: number): void {
        const index = this.getParamIndex(name);
        if (this.target[index] === value) return;

        this.target[index] = value;

        if (this.attack[index] <= 0 && this.release[index] <= 0) {
            if (this.current[index] !== value) {
                this.current[index] = value;
                this.markDirty(index);
                this.scheduleUpdate();
            }
        } else {
            this.startLoop();
        }
    }

    public getValue(name: string, defaultValue: number = 0): number {
        const index = this.paramToIndex.get(name);
        return index === undefined ? defaultValue : this.current[index];
    }

    public setValues(parameters: Record<string, number>): void {
        for (const key in parameters) {
            if (Object.prototype.hasOwnProperty.call(parameters, key)) {
                this.setValue(key, parameters[key]);
            }
        }
    }

    public reset(): void {
        this.stopLoop();

        this.paramToIndex.clear();

        if (this.nextFreeIndex > 0) {
            this.inDirtyList.fill(0, 0, this.nextFreeIndex);
        }

        this.nextFreeIndex = 0;
        this.dirtyCount = 0;

        this.isUpdateScheduled = false;
        this.events.all.clear();
    }

    public on(parameterName: string, handler: (value: number) => void): void {
        this.events.on(parameterName, handler);
    }

    public off(parameterName: string, handler: (value: number) => void): void {
        this.events.off(parameterName, handler);
    }

    private getParamIndex(name: string): number {
        let index = this.paramToIndex.get(name);
        if (index === undefined) {
            index = this.nextFreeIndex++;
            this.paramToIndex.set(name, index);
            this.indexToParam[index] = name;
        }
        return index;
    }

    private markDirty(index: number): void {
        if (this.inDirtyList[index] === 0) {
            this.dirtyIndices[this.dirtyCount++] = index;
            this.inDirtyList[index] = 1;
        }
    }

    private scheduleUpdate(): void {
        if (this.isUpdateScheduled) return;
        this.isUpdateScheduled = true;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(() => this.flush());
    }

    private flush(): void {
        this.isUpdateScheduled = false;

        for (let index = 0; index < this.dirtyCount; index++) {
            const parameterIndex = this.dirtyIndices[index];
            const name = this.indexToParam[parameterIndex];
            this.events.emit(name, this.current[parameterIndex]);

            this.inDirtyList[parameterIndex] = 0;
        }

        this.dirtyCount = 0;
    }

    private startLoop(): void {
        if (this.tickerId !== null) return;
        this.lastTime = performance.now();
        this.tickerId = workerTimers.setInterval(() => this.tick(), this.TICK_RATE_MS);
    }

    private stopLoop(): void {
        if (this.tickerId !== null) {
            workerTimers.clearInterval(this.tickerId);
            this.tickerId = null;
        }
    }

    private tick(): void {
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;

        let hasActiveInterpolations = false;

        for (let index = 0; index < this.nextFreeIndex; index++) {
            const t = this.target[index];
            const c = this.current[index];

            if (Math.abs(c - t) < 1e-4) {
                if (c !== t) {
                    this.current[index] = t;
                    this.markDirty(index);
                }
                continue;
            }

            hasActiveInterpolations = true;
            const slewTimeMs = t > c ? this.attack[index] : this.release[index];

            if (slewTimeMs <= 0) {
                this.current[index] = t;
            } else {
                const timeConstant = slewTimeMs / 1000 / 5;
                const alpha = 1 - Math.exp(-deltaTime / Math.max(0.001, timeConstant));
                this.current[index] = c + (t - c) * alpha;
            }

            this.markDirty(index);
        }

        if (this.dirtyCount > 0) {
            this.scheduleUpdate();
        }

        if (!hasActiveInterpolations) {
            this.stopLoop();
        }
    }
}
