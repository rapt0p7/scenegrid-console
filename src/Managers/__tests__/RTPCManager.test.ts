import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import RTPCManager from '../RTPCManager';

vi.mock('worker-timers', () => ({
    setInterval: (callback: TimerHandler, ms?: number) => setInterval(callback, ms),
    clearInterval: (id: number | undefined) => clearInterval(id)
}));

describe('RTPCManager', () => {
    let manager: RTPCManager;

    beforeEach(() => {
        vi.useFakeTimers();
        manager = new RTPCManager();
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    describe('Instant Values (Backwards Compatibility)', () => {
        it('should store and retrieve a single value', () => {
            manager.setValue('MUSIC_VOLUME', 0.8);
            expect(manager.getValue('MUSIC_VOLUME')).toBe(0.8);
        });

        it('should return default value if parameter is not set', () => {
            expect(manager.getValue('UNKNOWN_PARAM')).toBe(0);
            expect(manager.getValue('UNKNOWN_PARAM', 42)).toBe(42);
        });

        it('should emit an event when value is changed', async () => {
            const spy = vi.fn();
            manager.events.on('MUSIC_VOLUME', spy);

            manager.setValue('MUSIC_VOLUME', 0.5);

            await Promise.resolve();

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith(0.5);
        });

        it('should NOT emit an event if the value has not changed (early return)', () => {
            manager.setValue('MUSIC_VOLUME', 0.5);

            const spy = vi.fn();
            manager.events.on('MUSIC_VOLUME', spy);

            manager.setValue('MUSIC_VOLUME', 0.5);

            expect(spy).not.toHaveBeenCalled();
        });

        it('should set multiple values and emit events for each in one batch', async () => {
            const spyMusic = vi.fn();
            const spySFX = vi.fn();
            manager.events.on('MUSIC_VOLUME', spyMusic);
            manager.events.on('SFX_VOLUME', spySFX);

            manager.setValues({
                MUSIC_VOLUME: 0.7,
                SFX_VOLUME: 0.9
            });

            await Promise.resolve();

            expect(manager.getValue('MUSIC_VOLUME')).toBe(0.7);
            expect(manager.getValue('SFX_VOLUME')).toBe(0.9);
            expect(spyMusic).toHaveBeenCalledWith(0.7);
            expect(spySFX).toHaveBeenCalledWith(0.9);
        });

        it('should clear all values, events, and stop loop on reset', async () => {
            const spy = vi.fn();
            manager.events.on('MUSIC_VOLUME', spy);

            manager.setValue('MUSIC_VOLUME', 1);
            await Promise.resolve();
            expect(spy).toHaveBeenCalledTimes(1);

            manager.reset();
            spy.mockClear();

            expect(manager.getValue('MUSIC_VOLUME', -1)).toBe(-1);

            manager.setValue('MUSIC_VOLUME', 0.5);
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('Interpolation and Slew Rates', () => {
        it('should correctly configure parameters without triggering immediate change', () => {
            manager.configureParam('HP', 1000, 2000);
            manager.setValue('HP', 100);

            expect(manager.getValue('HP')).toBe(0);
        });

        it('should apply values instantly if attack and release are <= 0', async () => {
            manager.configureParam('HP', 0, 0);
            manager.setValue('HP', 100);

            expect(manager.getValue('HP')).toBe(100);
        });

        it('should interpolate value over time when increasing (Attack)', async () => {
            const spy = vi.fn();
            manager.events.on('HP', spy);

            manager.configureParam('HP', 1000, 0);
            manager.setValue('HP', 100);

            vi.advanceTimersByTime(30);
            await Promise.resolve();

            const firstTickValue = manager.getValue('HP');
            expect(firstTickValue).toBeGreaterThan(0);
            expect(firstTickValue).toBeLessThan(100);
            expect(spy).toHaveBeenCalledWith(firstTickValue);

            vi.advanceTimersByTime(3000);
            await Promise.resolve();

            expect(manager.getValue('HP')).toBe(100);
        });

        it('should interpolate value over time when decreasing (Release)', async () => {
            manager.setValue('HP', 100);
            await Promise.resolve();

            manager.configureParam('HP', 0, 1000);
            manager.setValue('HP', 0);

            vi.advanceTimersByTime(30);
            await Promise.resolve();

            const firstTickValue = manager.getValue('HP');
            expect(firstTickValue).toBeLessThan(100);
            expect(firstTickValue).toBeGreaterThan(0);

            vi.advanceTimersByTime(3000);
            await Promise.resolve();

            expect(manager.getValue('HP')).toBe(0);
        });

        it('should handle multiple parameters interpolating in the same loop', async () => {
            manager.configureParam('P1', 1000, 1000);
            manager.configureParam('P2', 500, 500);

            manager.setValue('P1', 100);
            manager.setValue('P2', 50);

            vi.advanceTimersByTime(30);
            await Promise.resolve();

            expect(manager.getValue('P1')).toBeGreaterThan(0);
            expect(manager.getValue('P2')).toBeGreaterThan(0);
        });

        it('should snap to target if difference is very small (< 1e-4)', async () => {
            manager.configureParam('HP', 1000, 1000);
            manager.setValue('HP', 99.999_99);

            manager.configureParam('HP', 0, 0);
            manager.setValue('HP', 99.999_95);
            manager.configureParam('HP', 1000, 1000);

            manager.setValue('HP', 100);

            vi.advanceTimersByTime(30);
            await Promise.resolve();

            expect(manager.getValue('HP')).toBe(100);
        });

        it('should fallback to instant assignment if slewTimeMs becomes 0 mid-flight', async () => {
            manager.configureParam('HP', 1000, 1000);
            manager.setValue('HP', 100);

            vi.advanceTimersByTime(30);

            manager.configureParam('HP', 0, 0);

            vi.advanceTimersByTime(30);
            await Promise.resolve();

            expect(manager.getValue('HP')).toBe(100);
        });

        it('should stop the loop automatically when all interpolations finish', async () => {
            manager.configureParam('HP', 100, 100);
            manager.setValue('HP', 10);

            vi.advanceTimersByTime(500);
            await Promise.resolve();

            expect(manager.getValue('HP')).toBe(10);

            const spy = vi.fn();
            manager.events.on('HP', spy);

            vi.advanceTimersByTime(100);
            await Promise.resolve();

            expect(spy).not.toHaveBeenCalled();
        });
    });
});
