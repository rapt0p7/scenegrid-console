// oxlint-disable max-lines-per-function
// noinspection D

import type { IEngineTicker } from '@domain/Shared/Ports/IEngineTicker.js';
import type { AudioCtx, AudioParamLike } from '@infrastructure/types/IAudioContext.js';

import { type TickerTaskId, type ContextTime, type Milliseconds, type Seconds, TimeMath } from '@scene-grid/shared';

// eslint-disable-next-line @typescript-eslint/naming-convention
const isChromeAndroid =
    typeof navigator !== 'undefined' &&
    navigator.userAgent.includes('Chrome') &&
    navigator.userAgent.includes('Android');

type RampType = 'linear' | 'exponential' | 'equal-power';

interface PendingRamp {
    param: AudioParamLike;
    target: number;
    duration: Seconds;
    type: RampType;
    startTime: ContextTime;
}

export default class AutomationEngine {
    readonly #ctx: AudioCtx;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public static TICK_DIVIDER: number = 1;
    private static readonly CURVE_STEPS = 100;
    private static readonly CONSTANT_CURVE_BUFFER = new Float32Array(AutomationEngine.CURVE_STEPS);
    private readonly DIGITAL_SILENCE = 0.000_01;

    #pending: PendingRamp[] = [];

    constructor(context: AudioCtx, ticker: IEngineTicker) {
        this.#ctx = context;

        ticker.add('automation-engine' as TickerTaskId, AutomationEngine.TICK_DIVIDER, this);
    }

    set(parameter: AudioParamLike, value: number): void {
        const target = value;
        if (!Number.isFinite(target)) {
            console.warn('[AutomationEngine] Invalid value:', value);
            return;
        }

        const now = this.#ctx.currentTime as ContextTime;

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
        duration: Milliseconds,
        type: RampType = 'linear',
        delay: Milliseconds = 0 as Milliseconds
    ): void {
        const target = value;
        if (!Number.isFinite(target)) {
            console.warn('[AutomationEngine] Invalid target:', value);
            return;
        }

        const durationSec = TimeMath.msToSeconds(duration);
        const delaySec = TimeMath.msToSeconds(delay);
        const now = this.#ctx.currentTime as ContextTime;
        const startTime = (now + delaySec) as ContextTime;

        if (this.#ctx.state !== 'running' || duration <= 0) {
            if (delaySec > 0) {
                parameter.setValueAtTime(target, startTime);
            } else {
                this.set(parameter, target);
            }
            return;
        }

        this.#pending.push({
            param: parameter,
            target,
            duration: durationSec,
            type,
            startTime
        });
    }

    // eslint-disable-next-line max-params
    public safeExponentialRamp(
        parameter: AudioParamLike,
        targetValue: number,
        endTime: ContextTime,
        contextTime: ContextTime
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

        const now = this.#ctx.currentTime as ContextTime;

        try {
            param.cancelScheduledValues(now);

            const currentValue = param.value;
            param.setValueAtTime(currentValue, now);

            if (startTime > now) {
                param.setValueAtTime(currentValue, startTime);

                const endTime = (startTime + duration) as ContextTime;
                if (type === 'equal-power') {
                    this.applyEqualPowerCurve(param, currentValue, target, startTime, duration);
                } else if (type === 'exponential') {
                    this.safeExponentialRamp(param, target, endTime, now);
                } else {
                    param.linearRampToValueAtTime(target, endTime);
                }
            } else {
                const elapsed = (now - startTime) as Seconds;
                const remaining = Math.max(0, duration - elapsed) as Seconds;

                if (remaining <= 0) {
                    param.setValueAtTime(target, now);
                    return;
                }

                if (isChromeAndroid) {
                    this.applyCurveFallback(param, target, remaining);
                    return;
                }

                const endTime = (now + remaining) as ContextTime;

                if (type === 'equal-power') {
                    this.applyEqualPowerCurve(param, currentValue, target, now, remaining);
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
        startTime: ContextTime,
        duration: Seconds
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

    private applyCurveFallback(parameter: AudioParamLike, target: number, duration: Seconds): void {
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
