// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import AutomationEngine from '../AutomationEngine.js';

import type { AudioCtx as AudioContext_ } from '../../types/IAudioContext.js';
import type { EngineTicker } from '@infrastructure/scheduling/EngineTicker.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { TickerTaskId } from '@shared/Types/Branded.js';

describe('AutomationEngine', () => {
    let mockContext: AudioContext_;
    let mockParameter: any;
    let mockTicker: any;
    let capturedTickTarget: ITickable | null;
    let engine: AutomationEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedTickTarget = null;

        mockContext = {
            state: 'running',
            currentTime: 1
        } as unknown as AudioContext_;

        mockParameter = {
            value: 0.5,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            setValueCurveAtTime: vi.fn()
        };

        mockTicker = {
            add: vi.fn().mockImplementation((id: TickerTaskId, rate: number, target: ITickable) => {
                capturedTickTarget = target;
            }),
            remove: vi.fn()
        } as unknown as EngineTicker;

        engine = new AutomationEngine(mockContext, mockTicker);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function triggerTick() {
        if (capturedTickTarget) {
            capturedTickTarget.tick(mockContext.currentTime, (AutomationEngine as any).TICK_RATE_MS ?? 15);
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

        it('should safely catch exceptions thrown by AudioParam', () => {
            mockParameter.setValueAtTime.mockImplementationOnce(() => {
                throw new Error('WebAudio internal error');
            });
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            expect(() => {
                engine.set(mockParameter, 0.8);
            }).not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('set() failed'), expect.any(Error));

            consoleSpy.mockRestore();
        });
    });

    describe('ramp() - Batching and Math', () => {
        it('should register target to EngineTicker on init', () => {
            expect(mockTicker.add).toHaveBeenCalledWith(
                'automation-engine',
                (AutomationEngine as any).TICK_RATE_MS ?? 15,
                expect.any(Object)
            );
            expect(capturedTickTarget).toBeDefined();
        });

        it('should ignore invalid targets in ramp (NaN or Infinity)', () => {
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            engine.ramp(mockParameter, Number.NaN, 1000);

            expect(mockParameter.setValueAtTime).not.toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid target'), Number.NaN);

            consoleSpy.mockRestore();
        });

        it('should set immediately if context is not running', () => {
            (mockContext as any).state = 'suspended';
            engine.ramp(mockParameter, 1, 500);

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(1, 1);
            expect(mockParameter.linearRampToValueAtTime).not.toHaveBeenCalled();
        });

        it('should schedule setValueAtTime if duration is <= 0 but delay exists', () => {
            engine.ramp(mockParameter, 0.5, 0, 'linear', 2000);
            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.5, 3);
        });

        it('should apply linear ramp correctly via EngineTicker batching', () => {
            engine.ramp(mockParameter, 1, 2000);

            triggerTick();

            expect(mockParameter.cancelScheduledValues).toHaveBeenCalledWith(1);
            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.5, 1);
            expect(mockParameter.linearRampToValueAtTime).toHaveBeenCalledWith(1, 3);
        });

        it('should apply exponential ramp correctly', () => {
            engine.ramp(mockParameter, 1, 1000, 'exponential');
            triggerTick();
            expect(mockParameter.exponentialRampToValueAtTime).toHaveBeenCalledWith(1, 2);
        });

        it('should apply equal-power curve correctly (Fade In)', () => {
            engine.ramp(mockParameter, 1, 1000, 'equal-power');
            triggerTick();
            expect(mockParameter.setValueCurveAtTime).toHaveBeenCalledWith(expect.any(Float32Array), 1, 1);
        });

        it('should generate equal-power curve correctly (Fade Out / target < start)', () => {
            mockParameter.value = 1;
            engine.ramp(mockParameter, 0.1, 1000, 'equal-power');
            triggerTick();

            expect(mockParameter.setValueCurveAtTime).toHaveBeenCalled();
            const curve = mockParameter.setValueCurveAtTime.mock.calls[0][0];

            expect(curve[0]).toBeCloseTo(1);
            expect(curve.at(-1)).toBeCloseTo(0.1);
        });

        it('should handle safeExponentialRamp zero-value math correctly', () => {
            mockParameter.value = 0;
            engine.safeExponentialRamp(mockParameter, 0, 2, 1);

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.000_01, 1);
            expect(mockParameter.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.000_01, 2);
            expect(mockParameter.linearRampToValueAtTime).toHaveBeenCalledWith(0, 2.005);
        });

        it('should safely fallback to set() if ramp throws an error', () => {
            mockParameter.linearRampToValueAtTime.mockImplementationOnce(() => {
                throw new Error('Graph invalid');
            });
            const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            engine.ramp(mockParameter, 1, 1000, 'linear');
            triggerTick();

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(1, 1);

            consoleSpy.mockRestore();
        });
    });

    describe('ramp() - Time and Delay Edge Cases', () => {
        it('should schedule delayed linear ramp correctly', () => {
            engine.ramp(mockParameter, 1, 1000, 'linear', 500);
            triggerTick();

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.5, 1.5);
            expect(mockParameter.linearRampToValueAtTime).toHaveBeenCalledWith(1, 2.5);
        });

        it('should schedule delayed exponential ramp correctly', () => {
            engine.ramp(mockParameter, 1, 1000, 'exponential', 500);
            triggerTick();

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.5, 1.5);
            expect(mockParameter.exponentialRampToValueAtTime).toHaveBeenCalledWith(1, 2.5);
        });

        it('should schedule delayed equal-power ramp correctly', () => {
            engine.ramp(mockParameter, 1, 1000, 'equal-power', 500);
            triggerTick();

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.5, 1.5);
            expect(mockParameter.setValueCurveAtTime).toHaveBeenCalledWith(expect.any(Float32Array), 1.5, 1);
        });

        it('should immediately set value if remaining duration <= 0 during delayed flush', () => {
            engine.ramp(mockParameter, 0.8, 1000);

            (mockContext as any).currentTime = 3;

            triggerTick();

            expect(mockParameter.setValueAtTime).toHaveBeenCalledWith(0.8, 3);
            expect(mockParameter.linearRampToValueAtTime).not.toHaveBeenCalled();
        });
    });
});

describe('AutomationEngine - Chrome Android Fallback', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('should use applyCurveFallback instead of native ramps on Chrome Android', async () => {
        vi.stubGlobal('navigator', {
            userAgent: 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/114.0.0.0 Safari/537.36'
        });

        vi.resetModules();

        const { default: AndroidAutomationEngine } = await import('../AutomationEngine.js');

        const mContext = { state: 'running', currentTime: 1 } as unknown as AudioContext_;
        const mParameter = {
            value: 0.5,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            setValueCurveAtTime: vi.fn()
        };

        let capturedTickTargetFallback: ITickable | null = null;
        const mTicker = {
            add: vi.fn().mockImplementation((_id: TickerTaskId, _rate: number, target: ITickable) => {
                capturedTickTargetFallback = target;
            })
        } as unknown as EngineTicker;

        const eng = new AndroidAutomationEngine(mContext, mTicker);

        eng.ramp(mParameter as any, 1, 1000, 'linear');

        capturedTickTargetFallback!.tick(mContext.currentTime, 15);

        expect(mParameter.linearRampToValueAtTime).not.toHaveBeenCalled();
        expect(mParameter.setValueCurveAtTime).toHaveBeenCalledWith(expect.any(Float32Array), 1, 1);
    });
});
