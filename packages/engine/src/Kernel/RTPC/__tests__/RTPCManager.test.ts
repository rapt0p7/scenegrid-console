import type { GameParamId, Milliseconds } from '@scene-grid/shared';

import RTPCManager from '@kernel/RTPC/RTPCManager.js';
/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('RTPCManager (Kernel Layer / Zero-Allocation Pull Model)', () => {
    let manager: RTPCManager;

    beforeEach(() => {
        manager = new RTPCManager();
    });

    describe('Instant Values & Pull Access', () => {
        it('should store and retrieve a single value', () => {
            manager.setValue('MUSIC_VOLUME' as GameParamId, 0.8);
            expect(manager.getValue('MUSIC_VOLUME' as GameParamId)).toBeCloseTo(0.8);
        });

        it('should return default value if parameter is not set', () => {
            expect(manager.getValue('UNKNOWN_PARAM' as GameParamId)).toBe(0);
            expect(manager.getValue('UNKNOWN_PARAM' as GameParamId, 42)).toBe(42);
        });

        it('should set multiple values correctly', () => {
            manager.setValues({
                MUSIC_VOLUME: 0.7,
                SFX_VOLUME: 0.9
            } as Record<GameParamId, number>);

            expect(manager.getValue('MUSIC_VOLUME' as GameParamId)).toBeCloseTo(0.7);
            expect(manager.getValue('SFX_VOLUME' as GameParamId)).toBeCloseTo(0.9);
        });

        it('should clear all values and reset state on reset()', () => {
            manager.setValue('MUSIC_VOLUME' as GameParamId, 1);
            manager.setOverride('MUSIC_VOLUME' as GameParamId, 0.5, true);
            manager.reset();

            expect(manager.getValue('MUSIC_VOLUME' as GameParamId, -1)).toBe(-1);
            expect(manager.getValue('MUSIC_VOLUME' as GameParamId, 0)).toBe(0);
        });
    });

    describe('Interpolation and Slew Rates (Math ticking)', () => {
        it('should correctly configure parameters without triggering immediate change', () => {
            manager.configureParam('HP' as GameParamId, 1000 as Milliseconds, 2000 as Milliseconds);
            manager.setValue('HP' as GameParamId, 100);

            expect(manager.getValue('HP' as GameParamId)).toBe(0);
        });

        it('should apply values instantly if attack and release are <= 0', () => {
            manager.configureParam('HP' as GameParamId, 0 as Milliseconds, 0 as Milliseconds);
            manager.setValue('HP' as GameParamId, 100);

            expect(manager.getValue('HP' as GameParamId)).toBe(100);
        });

        it('should interpolate value over time when increasing (Attack)', () => {
            manager.configureParam('HP' as GameParamId, 1000 as Milliseconds, 0 as Milliseconds);
            manager.setValue('HP' as GameParamId, 100);

            manager.tick(0, 30 as Milliseconds);

            const firstTickValue = manager.getValue('HP' as GameParamId);
            expect(firstTickValue).toBeGreaterThan(0);
            expect(firstTickValue).toBeLessThan(100);

            manager.tick(0, 3000 as Milliseconds);
            manager.tick(0, 30 as Milliseconds);

            expect(manager.getValue('HP' as GameParamId)).toBe(100);
        });

        it('should interpolate value over time when decreasing (Release)', () => {
            manager.setValue('HP' as GameParamId, 100);

            manager.configureParam('HP' as GameParamId, 0 as Milliseconds, 1000 as Milliseconds);
            manager.setValue('HP' as GameParamId, 0);

            manager.tick(0, 30 as Milliseconds);

            const firstTickValue = manager.getValue('HP' as GameParamId);
            expect(firstTickValue).toBeLessThan(100);
            expect(firstTickValue).toBeGreaterThan(0);

            manager.tick(0, 3000 as Milliseconds);
            manager.tick(0, 30 as Milliseconds);

            expect(manager.getValue('HP' as GameParamId)).toBe(0);
        });

        it('should handle multiple parameters interpolating in the same tick', () => {
            manager.configureParam('P1' as GameParamId, 1000 as Milliseconds, 1000 as Milliseconds);
            manager.configureParam('P2' as GameParamId, 500 as Milliseconds, 500 as Milliseconds);

            manager.setValue('P1' as GameParamId, 100);
            manager.setValue('P2' as GameParamId, 50);

            manager.tick(0, 30 as Milliseconds);

            expect(manager.getValue('P1' as GameParamId)).toBeGreaterThan(0);
            expect(manager.getValue('P2' as GameParamId)).toBeGreaterThan(0);
        });

        it('should snap to target if difference is very small (< 1e-4)', () => {
            manager.configureParam('HP' as GameParamId, 1000 as Milliseconds, 1000 as Milliseconds);

            manager.setValue('HP' as GameParamId, 99.999_99);

            manager.configureParam('HP' as GameParamId, 0 as Milliseconds, 0 as Milliseconds);
            manager.setValue('HP' as GameParamId, 99.999_95);
            manager.configureParam('HP' as GameParamId, 1000 as Milliseconds, 1000 as Milliseconds);

            manager.setValue('HP' as GameParamId, 100);

            manager.tick(0, 30 as Milliseconds);

            expect(manager.getValue('HP' as GameParamId)).toBe(100);
        });

        it('should fallback to instant assignment if slewTimeMs becomes 0 mid-flight', () => {
            manager.configureParam('HP' as GameParamId, 1000 as Milliseconds, 1000 as Milliseconds);
            manager.setValue('HP' as GameParamId, 100);

            manager.tick(0, 30 as Milliseconds);

            manager.configureParam('HP' as GameParamId, 0 as Milliseconds, 0 as Milliseconds);

            manager.tick(0, 30 as Milliseconds);

            expect(manager.getValue('HP' as GameParamId)).toBe(100);
        });

        it('should sleep automatically (isInterpolating = false) when all interpolations finish', () => {
            manager.configureParam('HP' as GameParamId, 100 as Milliseconds, 100 as Milliseconds);
            manager.setValue('HP' as GameParamId, 10);

            expect((manager as any).isInterpolating).toBe(true);

            manager.tick(0, 500 as Milliseconds);
            manager.tick(0, 30 as Milliseconds);

            expect(manager.getValue('HP' as GameParamId)).toBe(10);

            expect((manager as any).isInterpolating).toBe(false);
        });

        it('should early exit from setValue if value matches current target', () => {
            manager.setValue('HP' as GameParamId, 50);
            manager.setValue('HP' as GameParamId, 50);
            expect(manager.getValue('HP' as GameParamId)).toBe(50);
        });
    });

    describe('Debug Overrides Logic', () => {
        it('should hijack value access when an override is active', () => {
            manager.setValue('P1' as GameParamId, 10);
            manager.setOverride('P1' as GameParamId, 99, true);

            expect(manager.getValue('P1' as GameParamId)).toBe(99);
        });

        it('should restore normal value access when override is disabled', () => {
            manager.setValue('P1' as GameParamId, 10);
            manager.setOverride('P1' as GameParamId, 99, true);
            manager.setOverride('P1' as GameParamId, 99, false);

            expect(manager.getValue('P1' as GameParamId)).toBe(10);
        });

        it('should wake up the interpolator when disabling override if game state shifted in the background', () => {
            manager.configureParam('P1' as GameParamId, 1000 as Milliseconds, 1000 as Milliseconds);
            manager.setValue('P1' as GameParamId, 10);

            manager.setOverride('P1' as GameParamId, 99, true);
            manager.setValue('P1' as GameParamId, 50);

            expect((manager as any).isInterpolating).toBe(true);
            (manager as any).isInterpolating = false;

            manager.setOverride('P1' as GameParamId, 99, false);

            expect((manager as any).isInterpolating).toBe(true);
        });

        it('should not wake up the interpolator when disabling override if game state matches current value', () => {
            manager.setValue('P1' as GameParamId, 10);
            manager.setOverride('P1' as GameParamId, 99, true);

            (manager as any).isInterpolating = false;

            manager.setOverride('P1' as GameParamId, 99, false);
            expect((manager as any).isInterpolating).toBe(false);
        });

        it('should clear all active overrides via resetOverrides()', () => {
            manager.setValue('P1' as GameParamId, 10);
            manager.setValue('P2' as GameParamId, 20);

            manager.setOverride('P1' as GameParamId, 88, true);
            manager.setOverride('P2' as GameParamId, 88, true);

            expect(manager.getValue('P1' as GameParamId)).toBe(88);
            expect(manager.getValue('P2' as GameParamId)).toBe(88);

            manager.resetOverrides();

            expect(manager.getValue('P1' as GameParamId)).toBe(10);
            expect(manager.getValue('P2' as GameParamId)).toBe(20);
        });

        it('should trigger wake up from resetOverrides() if background drift exists', () => {
            manager.configureParam('P1' as GameParamId, 1000 as Milliseconds, 1000 as Milliseconds);
            manager.setValue('P1' as GameParamId, 10);
            manager.setOverride('P1' as GameParamId, 88, true);
            manager.setValue('P1' as GameParamId, 50);
            (manager as any).isInterpolating = false;

            manager.resetOverrides();

            expect((manager as any).isInterpolating).toBe(true);
        });
    });

    describe('RTPCManager (Structural Integrity & Mutant Assassins)', () => {
        it('should initialize isInterpolating to false (Line 15)', () => {
            const newManager = new RTPCManager();
            expect((newManager as any).isInterpolating).toBe(false);
        });

        it('should pre-allocate indexToParam array to MAX_PARAMS (1024) to prevent dynamic resizing (Line 13)', () => {
            const freshManager = new RTPCManager();

            expect((freshManager as any).indexToParam.length).toBe(1024);
        });

        it('should cleanly reset isInterpolating to false (Line 98)', () => {
            manager.configureParam('P1' as GameParamId, 1000 as Milliseconds, 1000 as Milliseconds);
            manager.setValue('P1' as GameParamId, 100);

            expect((manager as any).isInterpolating).toBe(true);

            manager.reset();

            expect((manager as any).isInterpolating).toBe(false);
        });

        it('should return early from setValue if target matches value to avoid waking interpolator (Line 37)', () => {
            manager.configureParam('HP' as GameParamId, 1000 as Milliseconds, 1000 as Milliseconds);
            manager.setValue('HP' as GameParamId, 100);
            (manager as any).isInterpolating = false;

            manager.setValue('HP' as GameParamId, 100);

            expect((manager as any).isInterpolating).toBe(false);
        });

        it('should skip tick processing entirely if not interpolating (Line 103)', () => {
            manager.setValue('HP' as GameParamId, 100);
            manager.tick(0, 30 as Milliseconds);

            (manager as any).target[0] = 200;
            (manager as any).isInterpolating = false;

            manager.tick(0, 30 as Milliseconds);

            expect(manager.getValue('HP' as GameParamId)).toBe(100);
        });

        it('should ignore properties from prototype chain in setValues (Line 89)', () => {
            const base = { PROTOTYPE_PARAM: 100 };
            const params = Object.create(base);
            params.OWN_PARAM = 50;

            manager.setValues(params);

            expect(manager.getValue('OWN_PARAM' as GameParamId)).toBe(50);
            expect(manager.getValue('PROTOTYPE_PARAM' as GameParamId)).toBe(0);
        });

        it('should not wake up interpolator in resetOverrides if no overrides caused drift (Lines 63, 75)', () => {
            manager.setValue('P1' as GameParamId, 10);
            (manager as any).isInterpolating = false;

            manager.resetOverrides();

            expect((manager as any).isInterpolating).toBe(false);
        });

        it('should only reset actively overridden flags in resetOverrides (Line 66)', () => {
            manager.setValue('P1' as GameParamId, 10);
            (manager as any).target[0] = 100;
            (manager as any).isInterpolating = false;

            manager.resetOverrides();

            expect((manager as any).isInterpolating).toBe(false);
        });

        it('should strictly evaluate threshold in resetOverrides without Float32 precision loss (Line 69)', () => {
            manager.setValue('P1' as GameParamId, 0);
            manager.setOverride('P1' as GameParamId, 100, true);
            (manager as any).isInterpolating = false;

            (manager as any).current = [0];
            (manager as any).target = [1e-4];

            manager.resetOverrides();

            expect((manager as any).isInterpolating).toBe(false);
        });

        it('should evaluate exact mathematical difference (subtraction), not sum, in resetOverrides (Line 69)', () => {
            manager.setValue('P1' as GameParamId, 0);
            manager.setOverride('P1' as GameParamId, 100, true);
            (manager as any).isInterpolating = false;

            (manager as any).current[0] = 10;
            (manager as any).target[0] = -10;

            manager.resetOverrides();

            expect((manager as any).isInterpolating).toBe(true);
        });

        it('should strictly evaluate threshold when disabling override without Float32 precision loss (Line 56)', () => {
            manager.setValue('P1' as GameParamId, 0);
            manager.setOverride('P1' as GameParamId, 100, true);
            (manager as any).isInterpolating = false;

            (manager as any).current = [0];
            (manager as any).target = [1e-4];

            manager.setOverride('P1' as GameParamId, 100, false);

            expect((manager as any).isInterpolating).toBe(false);
        });

        it('should strictly bound internal loops to prevent out-of-bounds array access (Lines 65, 108)', () => {
            manager.setValue('P1' as GameParamId, 10);
            manager.configureParam('P1' as GameParamId, 1000 as Milliseconds, 1000 as Milliseconds);
            manager.setValue('P1' as GameParamId, 20);

            const outOfBoundsIndex = (manager as any).nextFreeIndex;

            (manager as any).current[outOfBoundsIndex] = 50;
            (manager as any).target[outOfBoundsIndex] = 100;
            (manager as any).overrideFlags[outOfBoundsIndex] = 1;

            manager.resetOverrides();
            manager.tick(0, 30 as Milliseconds);

            expect((manager as any).overrideFlags[outOfBoundsIndex]).toBe(1);
            expect((manager as any).current[outOfBoundsIndex]).toBe(50);
        });

        it('should strictly evaluate < 1e-4 bounds without triggering on exact equality (Line 112)', () => {
            (manager as any).current = [0];
            (manager as any).target = [1e-4];
            (manager as any).nextFreeIndex = 1;
            (manager as any).isInterpolating = true;

            manager.tick(0, 30 as Milliseconds);

            expect((manager as any).isInterpolating).toBe(true);
        });

        it('should prevent redundant memory writes when current already equals target (Line 113)', () => {
            let redundantWrite = false;

            const fakeCurrent: any = [];
            Object.defineProperty(fakeCurrent, '0', {
                get: () => 0,
                set: () => {
                    redundantWrite = true;
                }
            });

            (manager as any).current = fakeCurrent;
            (manager as any).target = [0];
            (manager as any).nextFreeIndex = 1;
            (manager as any).isInterpolating = true;

            manager.tick(0, 30 as Milliseconds);

            expect(redundantWrite).toBe(false);
        });

        it('should instantly snap to target if slew time is 0 to avoid alpha zeroing (Line 123)', () => {
            manager.configureParam('P1' as GameParamId, 0 as Milliseconds, 0 as Milliseconds);
            manager.setValue('P1' as GameParamId, 100);
            (manager as any).current[0] = 0;
            (manager as any).isInterpolating = true;

            manager.tick(0, 0 as Milliseconds);

            expect(manager.getValue('P1' as GameParamId)).toBe(100);
        });

        it('should evaluate attack direction strictly to select correct slew coefficient (Line 121)', () => {
            manager.configureParam('P1' as GameParamId, 5000 as Milliseconds, 10000 as Milliseconds);
            manager.setValue('P1' as GameParamId, 50);
            (manager as any).current[0] = 50;
            (manager as any).isInterpolating = true;

            const absSpy = vi.spyOn(Math, 'abs').mockReturnValue(1);
            const maxSpy = vi.spyOn(Math, 'max');

            manager.tick(0, 30 as Milliseconds);

            expect(maxSpy).toHaveBeenCalledWith(0.001, 2);

            absSpy.mockRestore();
            maxSpy.mockRestore();
        });
    });
});
