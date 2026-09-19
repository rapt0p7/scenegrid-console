// noinspection D

import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { EngineTicker } from '@infrastructure/scheduling/EngineTicker.js';
import type { ContextTime, Milliseconds, TickerTaskId } from '@scene-grid/shared';

import { AudioContext as MockAudioContext, registrar } from 'standardized-audio-context-mock';
// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { AudioCtx } from '../../types/IAudioContext.js';

import AutomationEngine from '../AutomationEngine.js';

describe('AutomationEngine', () => {
    let mockContext: AudioCtx;
    let mockParameter: any;
    let mockTicker: any;
    let capturedTickTarget: ITickable | null;
    let engine: AutomationEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedTickTarget = null;

        const realMockContext = new MockAudioContext();
        mockContext = realMockContext as unknown as AudioCtx;

        vi.spyOn(mockContext, 'currentTime', 'get').mockReturnValue(1);
        vi.spyOn(mockContext, 'state', 'get').mockReturnValue('running');

        const gainNode = realMockContext.createGain();
        mockParameter = gainNode.gain;
        mockParameter.value = 0.5;

        vi.spyOn(mockParameter, 'cancelScheduledValues');
        vi.spyOn(mockParameter, 'setValueAtTime');
        vi.spyOn(mockParameter, 'linearRampToValueAtTime');
        vi.spyOn(mockParameter, 'exponentialRampToValueAtTime');
        vi.spyOn(mockParameter, 'setValueCurveAtTime');

        mockTicker = {
            add: vi.fn().mockImplementation((id: TickerTaskId, rate: number, target: ITickable) => {
                capturedTickTarget = target;
            }),
            remove: vi.fn()
        };

        engine = new AutomationEngine(mockContext, mockTicker);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        registrar.reset(mockContext as any);
    });

    function triggerTick() {
        if (capturedTickTarget) {
            capturedTickTarget.tick(mockContext.currentTime as ContextTime, 15 as Milliseconds);
        }
    }

    describe('set() - Immediate values', () => {
        it('should set valid number immediately', () => {
            engine.set(mockParameter, 0.8);
            expect(mockParameter.cancelScheduledValues).toHaveBeenCalledWith(1);
            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.8, 1);
        });

        it('should ignore invalid targets (NaN or Infinity)', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            engine.set(mockParameter, Number.NaN);
            engine.set(mockParameter, Infinity);

            expect(mockParameter.setValueAtTime).not.toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledTimes(2);
            consoleSpy.mockRestore();
        });
    });

    describe('ramp() - Batching and Math', () => {
        it('should register target to EngineTicker on init', () => {
            expect(mockTicker.add).toHaveBeenCalledWith(
                'automation-engine',
                AutomationEngine.TICK_DIVIDER,
                expect.any(Object)
            );
            expect(capturedTickTarget).toBeDefined();
        });

        it('should ignore invalid targets in ramp (NaN or Infinity)', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const res = engine.ramp(mockParameter, Number.NaN, 1000 as Milliseconds);

            expect(res?.ok).toBe(false);
            expect(mockParameter.setValueAtTime).not.toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid target'), expect.anything());

            consoleSpy.mockRestore();
        });

        it('should set immediately if context is not running', () => {
            vi.spyOn(mockContext, 'state', 'get').mockReturnValue('suspended');

            engine.ramp(mockParameter, 1, 500 as Milliseconds);

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(1, 1);
            expect(mockParameter.linearRampToValueAtTime).not.toHaveBeenCalled();
        });

        it('should schedule setValueAtTime if duration is <= 0 but delay exists', () => {
            engine.ramp(mockParameter, 0.5, 0 as Milliseconds, 'linear', 2000 as Milliseconds);
            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.5, 3);
        });

        it('should apply linear ramp correctly via EngineTicker batching', () => {
            engine.ramp(mockParameter, 1, 2000 as Milliseconds);

            triggerTick();

            expect(mockParameter.cancelScheduledValues).toHaveBeenCalledWith(1);
            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.5, 1);
            expect(mockParameter.linearRampToValueAtTime).toHaveBeenCalledWith(1, 3);
        });

        it('should apply exponential ramp correctly', () => {
            engine.ramp(mockParameter, 1, 1000 as Milliseconds, 'exponential');
            triggerTick();
            expect(mockParameter.exponentialRampToValueAtTime).toHaveBeenCalledWith(1, 2);
        });

        it('should apply equal-power curve correctly (Fade In)', () => {
            engine.ramp(mockParameter, 1, 1000 as Milliseconds, 'equal-power');
            triggerTick();
            expect(mockParameter.setValueCurveAtTime).toHaveBeenCalledWith(expect.any(Float32Array), 1, 1);
        });

        it('should generate equal-power curve correctly (Fade Out / target < start)', () => {
            mockParameter.value = 1;
            engine.ramp(mockParameter, 0.1, 1000 as Milliseconds, 'equal-power');
            triggerTick();

            expect(mockParameter.setValueCurveAtTime).toHaveBeenCalled();
            const curve = mockParameter.setValueCurveAtTime.mock.calls[0][0];

            expect(curve[0]).toBeCloseTo(1);
            expect(curve.at(-1)).toBeCloseTo(0.1);
        });

        it('should handle safeExponentialRamp zero-value math correctly', () => {
            mockParameter.value = 0;
            engine.safeExponentialRamp(mockParameter, 0, 2 as ContextTime, 1 as ContextTime);

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.000_01, 1);
            expect(mockParameter.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.000_01, 2);
            expect(mockParameter.linearRampToValueAtTime).toHaveBeenCalledWith(0, 2.005);
        });
    });

    describe('ramp() - Time and Delay Edge Cases', () => {
        it('should schedule delayed linear ramp correctly', () => {
            engine.ramp(mockParameter, 1, 1000 as Milliseconds, 'linear', 500 as Milliseconds);
            triggerTick();

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.5, 1.5);
            expect(mockParameter.linearRampToValueAtTime).toHaveBeenCalledWith(1, 2.5);
        });

        it('should schedule delayed exponential ramp correctly', () => {
            engine.ramp(mockParameter, 1, 1000 as Milliseconds, 'exponential', 500 as Milliseconds);
            triggerTick();

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.5, 1.5);
            expect(mockParameter.exponentialRampToValueAtTime).toHaveBeenCalledWith(1, 2.5);
        });

        it('should schedule delayed equal-power ramp correctly', () => {
            engine.ramp(mockParameter, 1, 1000 as Milliseconds, 'equal-power', 500 as Milliseconds);
            triggerTick();

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.5, 1.5);
            expect(mockParameter.setValueCurveAtTime).toHaveBeenCalledWith(expect.any(Float32Array), 1.5, 1);
        });

        it('should immediately set value if remaining duration <= 0 during delayed flush', () => {
            engine.ramp(mockParameter, 0.8, 1000 as Milliseconds);

            vi.spyOn(mockContext, 'currentTime', 'get').mockReturnValue(3);

            triggerTick();

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.8, 3);
            expect(mockParameter.linearRampToValueAtTime).not.toHaveBeenCalled();
        });
    });

    describe('set() - Logging', () => {
        it('should log descriptive warning when passed non-finite values', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            engine.set(mockParameter, Number.NaN);
            engine.set(mockParameter, Infinity);

            expect(consoleSpy).toHaveBeenNthCalledWith(1, '[AutomationEngine] Invalid value:', Number.NaN);
            expect(consoleSpy).toHaveBeenNthCalledWith(2, '[AutomationEngine] Invalid value:', Infinity);
            expect(mockParameter.setValueAtTime).not.toHaveBeenCalled();
        });
    });

    describe('tick() - Lifecycle and Queue Isolation', () => {
        it('should do nothing when tick is invoked with an empty queue on initialization', () => {
            triggerTick();

            expect(mockParameter.cancelScheduledValues).not.toHaveBeenCalled();
            expect(mockParameter.setValueAtTime).not.toHaveBeenCalled();
            expect(mockParameter.linearRampToValueAtTime).not.toHaveBeenCalled();
        });

        it('should clear the pending batch after execution so subsequent ticks are no-ops', () => {
            engine.ramp(mockParameter, 0.8, 1000 as Milliseconds, 'linear');

            triggerTick();
            expect(mockParameter.linearRampToValueAtTime).toHaveBeenCalledTimes(1);

            mockParameter.cancelScheduledValues.mockClear();
            mockParameter.setValueAtTime.mockClear();
            mockParameter.linearRampToValueAtTime.mockClear();

            triggerTick();

            expect(mockParameter.cancelScheduledValues).not.toHaveBeenCalled();
            expect(mockParameter.setValueAtTime).not.toHaveBeenCalled();
            expect(mockParameter.linearRampToValueAtTime).not.toHaveBeenCalled();
        });
    });

    describe('ramp() - Zero duration and default parameters', () => {
        it('should cancel scheduled values and set immediately via set() when duration is <= 0 and delay is 0', () => {
            const now = 1;

            engine.ramp(mockParameter, 0.8, 0 as Milliseconds);

            expect(mockParameter.cancelScheduledValues).toHaveBeenCalledWith(now);
            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.8, now);
            expect(mockParameter.linearRampToValueAtTime).not.toHaveBeenCalled();
        });

        it('should default ramp type to linear when omitted', () => {
            mockParameter.value = 0.2;

            engine.ramp(mockParameter, 0.8, 1000 as Milliseconds);
            triggerTick();

            expect(mockParameter.linearRampToValueAtTime).toHaveBeenCalledWith(0.8, 2);
            expect(mockParameter.exponentialRampToValueAtTime).not.toHaveBeenCalled();
            expect(mockParameter.setValueCurveAtTime).not.toHaveBeenCalled();
        });
    });

    describe('safeExponentialRamp - Positive values and non-zero targets', () => {
        it('should not clamp start value to DIGITAL_SILENCE when parameter.value is positive', () => {
            mockParameter.value = 0.5;
            const now = 1 as ContextTime;
            const endTime = 3 as ContextTime;

            engine.safeExponentialRamp(mockParameter, 0.8, endTime, now);

            expect(mockParameter.setValueAtTime).not.toHaveBeenCalled();
            expect(mockParameter.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.8, endTime);
        });

        it('should not append a linear ramp to zero when targetValue is positive', () => {
            mockParameter.value = 0.5;
            const now = 1 as ContextTime;
            const endTime = 3 as ContextTime;

            engine.safeExponentialRamp(mockParameter, 0.8, endTime, now);

            expect(mockParameter.linearRampToValueAtTime).not.toHaveBeenCalled();
            expect(mockParameter.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.8, endTime);
        });
    });

    describe('applyEqualPowerCurve - Mathematical curve fidelity', () => {
        it('should generate an accurate sine curve for equal-power fade-in across all 100 steps', () => {
            mockParameter.value = 0;
            const startValue = 0;
            const targetValue = 1;
            const steps = 100;

            engine.ramp(mockParameter, targetValue, 1000 as Milliseconds, 'equal-power');
            triggerTick();

            expect(mockParameter.setValueCurveAtTime).toHaveBeenCalledTimes(1);
            const curve: Float32Array = mockParameter.setValueCurveAtTime.mock.calls[0][0];

            expect(curve.length).toBe(steps);
            expect(curve[0]).toBeCloseTo(0, 5);
            expect(curve[steps - 1]).toBeCloseTo(1, 5);

            const midIndex = 50;
            const expectedMidT = midIndex / (steps - 1);
            const expectedMidFactor = Math.sin((expectedMidT * Math.PI) / 2);
            expect(curve[midIndex]).toBeCloseTo(startValue + (targetValue - startValue) * expectedMidFactor, 5);

            for (let i = 0; i < steps; i++) {
                const t = i / (steps - 1);
                const factor = Math.sin((t * Math.PI) / 2);
                const expected = startValue + (targetValue - startValue) * factor;
                expect(curve[i]).toBeCloseTo(expected, 4);
            }
        });

        it('should generate an accurate cosine curve for equal-power fade-out across all 100 steps', () => {
            mockParameter.value = 1;
            const startValue = 1;
            const targetValue = 0;
            const steps = 100;

            engine.ramp(mockParameter, targetValue, 1000 as Milliseconds, 'equal-power');
            triggerTick();

            expect(mockParameter.setValueCurveAtTime).toHaveBeenCalledTimes(1);
            const curve: Float32Array = mockParameter.setValueCurveAtTime.mock.calls[0][0];

            expect(curve.length).toBe(steps);
            expect(curve[0]).toBeCloseTo(1, 5);
            expect(curve[steps - 1]).toBeCloseTo(0, 5);

            for (let i = 0; i < steps; i++) {
                const t = i / (steps - 1);
                const factor = Math.cos((t * Math.PI) / 2);
                const expected = targetValue + (startValue - targetValue) * factor;
                expect(curve[i]).toBeCloseTo(expected, 4);
            }
        });

        it('should generate a constant flat curve when start and target values are identical', () => {
            mockParameter.value = 0.5;

            engine.ramp(mockParameter, 0.5, 1000 as Milliseconds, 'equal-power');
            triggerTick();

            const curve: Float32Array = mockParameter.setValueCurveAtTime.mock.calls[0][0];
            for (let i = 0; i < 100; i++) {
                expect(curve[i]).toBeCloseTo(0.5, 5);
            }
        });
    });

    describe('AutomationEngine - Chrome Android Fallback Buffer Verification', () => {
        it('should generate a point-by-point accurate linear curve buffer on Chrome Android', async () => {
            vi.stubGlobal('navigator', {
                userAgent: 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36'
            });
            vi.resetModules();

            let tickTarget: ITickable | null = null;
            const { default: AndroidEngine } = await import('../AutomationEngine.js');

            const mTicker = {
                add: vi.fn((_id: TickerTaskId, _rate: number, target: ITickable) => {
                    tickTarget = target;
                })
            } as unknown as EngineTicker;

            const realMockContext = new MockAudioContext();
            const mContext = realMockContext as unknown as AudioCtx;
            vi.spyOn(mContext, 'currentTime', 'get').mockReturnValue(1);
            vi.spyOn(mContext, 'state', 'get').mockReturnValue('running');

            const mParameter = realMockContext.createGain().gain;
            mParameter.value = 0.2;
            const targetValue = 0.8;
            const steps = 100;

            const setValueCurveSpy = vi.spyOn(mParameter, 'setValueCurveAtTime');

            const eng = new AndroidEngine(mContext, mTicker);

            eng.ramp(mParameter as any, targetValue, 1000 as Milliseconds, 'linear');

            tickTarget!.tick(mContext.currentTime as ContextTime, 15 as Milliseconds);

            expect(setValueCurveSpy).toHaveBeenCalledTimes(1);
            const curve = setValueCurveSpy.mock.calls[0][0] as Float32Array;

            expect(curve.length).toBe(steps);
            expect(curve[0]).toBeCloseTo(0.2, 5);
            expect(curve[steps - 1]).toBeCloseTo(0.8, 5);

            for (let i = 0; i < steps; i++) {
                const t = i / (steps - 1);
                const expectedValue = 0.2 + (targetValue - 0.2) * t;
                expect(curve[i]).toBeCloseTo(expectedValue, 5);
            }
        });
    });
});

describe('AutomationEngine - Chrome Android Fallback', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('should use applyCurveFallback instead of native ramps on Chrome Android', async () => {
        vi.stubGlobal('navigator', {
            userAgent: 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36'
        });

        vi.resetModules();

        const { default: AndroidAutomationEngine } = await import('../AutomationEngine.js');

        const realMockContext = new MockAudioContext();
        const mContext = realMockContext as unknown as AudioCtx;

        vi.spyOn(mContext, 'currentTime', 'get').mockReturnValue(1);
        vi.spyOn(mContext, 'state', 'get').mockReturnValue('running');

        const mParameter = realMockContext.createGain().gain;
        mParameter.value = 0.5;

        vi.spyOn(mParameter, 'linearRampToValueAtTime');
        vi.spyOn(mParameter, 'setValueCurveAtTime');

        let capturedTickTargetFallback: ITickable | null = null;
        const mTicker = {
            add: vi.fn().mockImplementation((_id: TickerTaskId, _rate: number, target: ITickable) => {
                capturedTickTargetFallback = target;
            })
        } as unknown as EngineTicker;

        const eng = new AndroidAutomationEngine(mContext, mTicker);

        eng.ramp(mParameter as any, 1, 1000 as Milliseconds, 'linear');

        capturedTickTargetFallback!.tick(mContext.currentTime as ContextTime, 15 as Milliseconds);

        expect(mParameter.linearRampToValueAtTime).not.toHaveBeenCalled();
        expect(mParameter.setValueCurveAtTime).toHaveBeenCalledWith(expect.any(Float32Array), 1, 1);
    });
});

describe('AutomationEngine - Platform Detection (isChromeAndroid)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
        vi.restoreAllMocks();
    });

    it('should use native linear ramp on Desktop Chrome without triggering Android curve fallback', async () => {
        vi.stubGlobal('navigator', {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        });
        vi.resetModules();
        const { default: DesktopEngine } = await import('../AutomationEngine.js');

        let tickTarget: ITickable | null = null;
        const ticker = {
            add: vi.fn((_id, _rate, t) => {
                tickTarget = t;
            })
        } as unknown as EngineTicker;
        const ctx = new MockAudioContext() as unknown as AudioCtx;
        vi.spyOn(ctx, 'currentTime', 'get').mockReturnValue(1);
        vi.spyOn(ctx, 'state', 'get').mockReturnValue('running');

        const param = new MockAudioContext().createGain().gain;
        param.value = 0.5;
        vi.spyOn(param, 'linearRampToValueAtTime');
        vi.spyOn(param, 'setValueCurveAtTime');

        const eng = new DesktopEngine(ctx, ticker);

        eng.ramp(param as any, 1, 1000 as Milliseconds, 'linear');
        tickTarget!.tick(1 as ContextTime, 15 as Milliseconds);

        expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(1, 2);
        expect(param.setValueCurveAtTime).not.toHaveBeenCalled();
    });

    it('should use native linear ramp on Android Firefox without triggering Chrome curve fallback', async () => {
        vi.stubGlobal('navigator', {
            userAgent: 'Mozilla/5.0 (Android 12; Mobile; rv:109.0) Gecko/114.0 Firefox/114.0'
        });
        vi.resetModules();
        const { default: AndroidFirefoxEngine } = await import('../AutomationEngine.js');

        let tickTarget: ITickable | null = null;
        const ticker = {
            add: vi.fn((_id, _rate, t) => {
                tickTarget = t;
            })
        } as unknown as EngineTicker;
        const ctx = new MockAudioContext() as unknown as AudioCtx;
        vi.spyOn(ctx, 'currentTime', 'get').mockReturnValue(1);
        vi.spyOn(ctx, 'state', 'get').mockReturnValue('running');

        const param = new MockAudioContext().createGain().gain;
        param.value = 0.5;
        vi.spyOn(param, 'linearRampToValueAtTime');
        vi.spyOn(param, 'setValueCurveAtTime');

        const eng = new AndroidFirefoxEngine(ctx, ticker);

        eng.ramp(param as any, 1, 1000 as Milliseconds, 'linear');
        tickTarget!.tick(1 as ContextTime, 15 as Milliseconds);

        expect(param.linearRampToValueAtTime).toHaveBeenCalledWith(1, 2);
        expect(param.setValueCurveAtTime).not.toHaveBeenCalled();
    });
});
