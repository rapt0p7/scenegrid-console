// noinspection D

import type { EngineTicker } from '@infrastructure/scheduling/EngineTicker.js';
import type { AudioCtx, AudioParamLike } from '@infrastructure/types/IAudioContext.js';
import type { TickerTaskId } from '@scene-grid/shared';

// eslint-disable-next-line @typescript-eslint/naming-convention
const isChromeAndroid =
    typeof navigator !== 'undefined' &&
    navigator.userAgent.includes('Chrome') &&
    navigator.userAgent.includes('Android');

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
    public static TICK_RATE_MS = 16;
    private static readonly CURVE_STEPS = 100;
    private static readonly CONSTANT_CURVE_BUFFER = new Float32Array(AutomationEngine.CURVE_STEPS);
    private static readonly MS_IN_SECONDS = 1000;
    private readonly DIGITAL_SILENCE = 0.000_01;

    #pending: PendingRamp[] = [];

    constructor(context: AudioCtx, ticker: EngineTicker) {
        this.#ctx = context;

        ticker.add('automation-engine' as TickerTaskId, AutomationEngine.TICK_RATE_MS, this);
    }

    set(parameter: AudioParamLike, value: number): void {
        const target = value;
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
        const target = value;
        if (!Number.isFinite(target)) {
            console.warn('[AutomationEngine] Invalid target:', value);
            return;
        }

        const duration = durationMs / AutomationEngine.MS_IN_SECONDS;
        const delay = delayMs / AutomationEngine.MS_IN_SECONDS;
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

    public tick(): void {
        if (this.#pending.length === 0) return;

        const batch = this.#pending;
        this.#pending = [];

        for (let index = 0; index < batch.length; index++) {
            this.applyRamp(batch[index]);
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
        const steps = AutomationEngine.CURVE_STEPS;
        const curve = AutomationEngine.CONSTANT_CURVE_BUFFER;

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
        const steps = AutomationEngine.CURVE_STEPS;
        const curve = AutomationEngine.CONSTANT_CURVE_BUFFER;
        const start = parameter.value;

        for (let index = 0; index < steps; index++) {
            const t = index / (steps - 1);
            curve[index] = start + (target - start) * t;
        }

        parameter.setValueCurveAtTime(curve, this.#ctx.currentTime, duration);
    }
}
