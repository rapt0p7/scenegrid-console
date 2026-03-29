// noinspection D

import type { AudioCtx, AudioParamLike } from '@webaudio-core/types/IAudioContext.js';

// eslint-disable-next-line @typescript-eslint/naming-convention
const isChromeAndroid =
    typeof navigator !== 'undefined' && /Chrome/.test(navigator.userAgent) && /Android/.test(navigator.userAgent);

type RampType = 'linear' | 'exponential' | 'equal-power';

interface PendingRamp {
    param: AudioParamLike;
    target: number;
    duration: number;
    type: RampType;
    startTime: number;
}

export default class AutomationEngine {
    readonly #ctx: AudioCtx;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    private readonly DIGITAL_SILENCE = 0.000_01;

    #pending: PendingRamp[] = [];
    #rafId: number | null = null;

    constructor(context: AudioCtx) {
        this.#ctx = context;
    }

    set(parameter: AudioParamLike, value: number): void {
        const target = Number(value);
        if (!Number.isFinite(target)) {
            console.warn('[AutomationEngine] Invalid value:', value);
            return;
        }

        const now = this.#ctx.currentTime;

        try {
            parameter.cancelScheduledValues(now);
            parameter.setValueAtTime(target, now);
        } catch (error) {
            console.warn('[AutomationEngine] set() failed:', error);
        }
    }

    // eslint-disable-next-line max-params
    ramp(
        parameter: AudioParamLike,
        value: number,
        durationMs: number,
        type: RampType = 'linear',
        delayMs: number = 0
    ): void {
        const target = Number(value);
        if (!Number.isFinite(target)) {
            console.warn('[AutomationEngine] Invalid target:', value);
            return;
        }

        const duration = durationMs / 1000;
        const delay = delayMs / 1000;
        const now = this.#ctx.currentTime;
        const startTime = now + delay;

        if (this.#ctx.state !== 'running' || duration <= 0) {
            if (delay > 0) {
                parameter.setValueAtTime(target, startTime);
            } else {
                this.set(parameter, target);
            }
            return;
        }

        this.#pending.push({
            param: parameter,
            target,
            duration,
            type,
            startTime
        });

        if (this.#rafId === null) {
            this.#rafId = requestAnimationFrame(() => this.flush());
        }
    }

    // eslint-disable-next-line max-params
    public safeExponentialRamp(
        parameter: AudioParamLike,
        targetValue: number,
        endTime: number,
        contextTime: number
    ): void {
        const safeTarget = Math.max(targetValue, this.DIGITAL_SILENCE);

        if (parameter.value <= 0) {
            parameter.setValueAtTime(this.DIGITAL_SILENCE, contextTime);
        }

        parameter.exponentialRampToValueAtTime(safeTarget, Math.max(contextTime, endTime));

        if (targetValue <= 0) {
            parameter.linearRampToValueAtTime(0, endTime + 0.005);
        }
    }

    private flush(): void {
        const batch = this.#pending;
        this.#pending = [];
        this.#rafId = null;

        for (const item of batch) {
            this.applyRamp(item);
        }
    }

    private applyRamp(item: PendingRamp): void {
        const { param, target, duration, type, startTime } = item;

        const now = this.#ctx.currentTime;

        try {
            param.cancelScheduledValues(now);

            const currentValue = param.value;
            param.setValueAtTime(currentValue, now);

            if (startTime > now) {
                param.setValueAtTime(currentValue, startTime);

                const endTime = startTime + duration;
                if (type === 'equal-power') {
                    this.applyEqualPowerCurve(param, currentValue, target, startTime, duration);
                } else if (type === 'exponential') {
                    this.safeExponentialRamp(param, target, endTime, now);
                } else {
                    param.linearRampToValueAtTime(target, endTime);
                }
            } else {
                const elapsed = now - startTime;
                const remaining = Math.max(0, duration - elapsed);

                if (remaining <= 0) {
                    param.setValueAtTime(target, now);
                    return;
                }

                if (isChromeAndroid) {
                    this.applyCurveFallback(param, target, remaining);
                    return;
                }

                const endTime = now + remaining;

                if (type === 'equal-power') {
                    this.applyEqualPowerCurve(param, currentValue, target, startTime, duration);
                } else if (type === 'exponential') {
                    this.safeExponentialRamp(param, target, endTime, now);
                } else {
                    param.linearRampToValueAtTime(target, endTime);
                }
            }
        } catch (error) {
            console.warn('[AutomationEngine] ramp() failed:', error);
            try {
                param.setValueAtTime(target, now);
            } catch {
                /* empty */
            }
        }
    }

    // eslint-disable-next-line max-params
    private applyEqualPowerCurve(
        parameter: AudioParamLike,
        startValue: number,
        targetValue: number,
        startTime: number,
        duration: number
    ): void {
        const steps = 100;
        const curve = new Float32Array(steps);

        const isFadeIn = targetValue > startValue;

        for (let index = 0; index < steps; index++) {
            const t = index / (steps - 1);

            if (isFadeIn) {
                const factor = Math.sin((t * Math.PI) / 2);
                curve[index] = startValue + (targetValue - startValue) * factor;
            } else {
                const factor = Math.cos((t * Math.PI) / 2);
                curve[index] = targetValue + (startValue - targetValue) * factor;
            }
        }

        parameter.setValueCurveAtTime(curve, startTime, duration);
    }

    private applyCurveFallback(parameter: AudioParamLike, target: number, duration: number): void {
        const steps = 100;
        const curve = new Float32Array(steps);
        const start = parameter.value;

        for (let index = 0; index < steps; index++) {
            const t = index / (steps - 1);
            curve[index] = start + (target - start) * t;
        }

        parameter.setValueCurveAtTime(curve, this.#ctx.currentTime, duration);
    }
}
