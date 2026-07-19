// noinspection D

import type { IRTPCManager } from '@kernel/RTPC/Ports/IRTPCManager.js';
import type { GameParamId, Milliseconds } from '@scene-grid/shared';

const MAX_PARAMS = 1024;

export default class RTPCManager implements IRTPCManager {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static TICK_RATE: Milliseconds = 30 as Milliseconds;

    private paramToIndex = new Map<GameParamId, number>();
    private indexToParam: GameParamId[] = Array.from({ length: MAX_PARAMS });
    private nextFreeIndex = 0;
    private isInterpolating = false;

    private current = new Float32Array(MAX_PARAMS);
    private target = new Float32Array(MAX_PARAMS);
    private attack = new Float32Array(MAX_PARAMS);
    private release = new Float32Array(MAX_PARAMS);

    private overrideFlags = new Uint8Array(MAX_PARAMS);
    private overrideValues = new Float32Array(MAX_PARAMS);

    public configureParam(
        name: GameParamId,
        attack: Milliseconds = 0 as Milliseconds,
        release: Milliseconds = 0 as Milliseconds
    ): void {
        const index = this.getParamIndex(name);
        this.attack[index] = attack;
        this.release[index] = release;
    }

    public setValue(name: GameParamId, value: number): void {
        const index = this.getParamIndex(name);
        if (this.target[index] === value) return;

        this.target[index] = value;

        if (this.attack[index] <= 0 && this.release[index] <= 0) {
            this.current[index] = value;
        } else {
            this.isInterpolating = true;
        }
    }

    public setOverride(name: GameParamId, value: number, isOverride: boolean): void {
        const index = this.getParamIndex(name);

        if (isOverride) {
            this.overrideFlags[index] = 1;
            this.overrideValues[index] = value;
        } else {
            this.overrideFlags[index] = 0;
            if (Math.abs(this.current[index] - this.target[index]) > 1e-4) {
                this.isInterpolating = true;
            }
        }
    }

    public resetOverrides(): void {
        let needsWakeUp = false;

        for (let index = 0; index < this.nextFreeIndex; index++) {
            if (this.overrideFlags[index] === 1) {
                this.overrideFlags[index] = 0;

                if (Math.abs(this.current[index] - this.target[index]) > 1e-4) {
                    needsWakeUp = true;
                }
            }
        }

        if (needsWakeUp) {
            this.isInterpolating = true;
        }
    }

    public getValue(name: GameParamId, defaultValue: number = 0): number {
        const index = this.paramToIndex.get(name);
        if (index === undefined) return defaultValue;

        return this.overrideFlags[index] === 1 ? this.overrideValues[index] : this.current[index];
    }

    public setValues(parameters: Record<GameParamId, number>): void {
        for (const key in parameters) {
            if (Object.prototype.hasOwnProperty.call(parameters, key)) {
                this.setValue(key as GameParamId, parameters[key as GameParamId]);
            }
        }
    }

    public reset(): void {
        this.paramToIndex.clear();
        this.nextFreeIndex = 0;
        this.isInterpolating = false;
        this.overrideFlags.fill(0);
    }

    public tick(currentTime: number, deltaTime: Milliseconds): void {
        if (!this.isInterpolating) return;

        const deltaTimeSec = deltaTime / 1000;
        let hasActive = false;

        for (let index = 0; index < this.nextFreeIndex; index++) {
            const t = this.target[index];
            const c = this.current[index];

            if (Math.abs(c - t) < 1e-4) {
                if (c !== t) {
                    this.current[index] = t;
                }
                continue;
            }

            hasActive = true;

            const slewTimeMs = t > c ? this.attack[index] : this.release[index];

            if (slewTimeMs <= 0) {
                this.current[index] = t;
            } else {
                const timeConstant = slewTimeMs / 1000 / 5;
                const alpha = 1 - Math.exp(-deltaTimeSec / Math.max(0.001, timeConstant));
                this.current[index] = c + (t - c) * alpha;
            }
        }

        if (!hasActive) {
            this.isInterpolating = false;
        }
    }

    private getParamIndex(name: GameParamId): number {
        let index = this.paramToIndex.get(name);
        if (index === undefined) {
            index = this.nextFreeIndex++;
            this.paramToIndex.set(name, index);
            this.indexToParam[index] = name;
        }
        return index;
    }
}
