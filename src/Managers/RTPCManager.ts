import mitt from 'mitt';
import * as workerTimers from 'worker-timers';

import type { IRTPCManager, RTPCEvents } from '../interfaces/IRTPCManager.js';
import type { Emitter } from 'mitt';

interface ParameterState {
    target: number;
    current: number;
    attackMs: number;
    releaseMs: number;
}

export default class RTPCManager implements IRTPCManager {
    public readonly events: Emitter<RTPCEvents> = mitt<RTPCEvents>();
    private states: Map<string, ParameterState> = new Map();
    private dirtyParams: Set<string> = new Set();
    private isUpdateScheduled = false;
    private tickerId: ReturnType<typeof workerTimers.setInterval> | null = null;
    private lastTime = 0;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private readonly TICK_RATE_MS = 30;

    public configureParam(parameterName: string, attackMs: number = 0, releaseMs: number = 0): void {
        const state = this.getState(parameterName);
        state.attackMs = attackMs;
        state.releaseMs = releaseMs;
    }

    public setValue(parameterName: string, value: number): void {
        const state = this.getState(parameterName);
        if (state.target === value) return;

        state.target = value;

        if (state.attackMs <= 0 && state.releaseMs <= 0) {
            if (state.current !== value) {
                state.current = value;
                this.dirtyParams.add(parameterName);
                this.scheduleUpdate();
            }
        } else {
            this.startLoop();
        }
    }

    public setValues(parameters: Record<string, number>): void {
        for (const [key, value] of Object.entries(parameters)) {
            this.setValue(key, value);
        }
    }

    public getValue(parameterName: string, defaultValue: number = 0): number {
        return this.states.get(parameterName)?.current ?? defaultValue;
    }

    public reset(): void {
        this.stopLoop();
        this.states.clear();
        this.dirtyParams.clear();
        this.isUpdateScheduled = false;
        this.events.all.clear();
    }

    private scheduleUpdate(): void {
        if (this.isUpdateScheduled) return;
        this.isUpdateScheduled = true;

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(() => this.flush());
    }

    private flush(): void {
        this.isUpdateScheduled = false;

        for (const parameter of this.dirtyParams) {
            const state = this.states.get(parameter);
            if (state !== undefined) {
                this.events.emit(parameter, state.current);
            }
        }

        this.dirtyParams.clear();
    }

    private getState(name: string): ParameterState {
        if (!this.states.has(name)) {
            this.states.set(name, { target: 0, current: 0, attackMs: 0, releaseMs: 0 });
        }
        return this.states.get(name)!;
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

        for (const [parameterName, state] of this.states.entries()) {
            const threshold = Math.max(1e-4, Math.abs(state.target) * 0.001);
            if (Math.abs(state.current - state.target) < threshold) {
                if (state.current !== state.target) {
                    state.current = state.target;
                    this.dirtyParams.add(parameterName);
                }
                continue;
            }

            hasActiveInterpolations = true;

            const isIncreasing = state.target > state.current;
            const slewTimeMs = isIncreasing ? state.attackMs : state.releaseMs;

            if (slewTimeMs <= 0) {
                state.current = state.target;
            } else {
                const timeConstant = slewTimeMs / 1000 / 5;
                const alpha = 1 - Math.exp(-deltaTime / Math.max(0.001, timeConstant));
                state.current += (state.target - state.current) * alpha;
            }

            this.dirtyParams.add(parameterName);
        }

        if (this.dirtyParams.size > 0) {
            this.scheduleUpdate();
        }

        if (!hasActiveInterpolations) {
            this.stopLoop();
        }
    }
}
