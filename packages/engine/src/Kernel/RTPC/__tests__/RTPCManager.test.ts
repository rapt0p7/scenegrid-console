/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, beforeEach } from 'vitest';

import RTPCManager from '@kernel/RTPC/RTPCManager.js';

import type { GameParamId } from '@scene-grid/shared';

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
            manager.configureParam('HP' as GameParamId, 1000, 2000);
            manager.setValue('HP' as GameParamId, 100);

            expect(manager.getValue('HP' as GameParamId)).toBe(0);
        });

        it('should apply values instantly if attack and release are <= 0', () => {
            manager.configureParam('HP' as GameParamId, 0, 0);
            manager.setValue('HP' as GameParamId, 100);

            expect(manager.getValue('HP' as GameParamId)).toBe(100);
        });

        it('should interpolate value over time when increasing (Attack)', () => {
            manager.configureParam('HP' as GameParamId, 1000, 0);
            manager.setValue('HP' as GameParamId, 100);

            manager.tick(0, 30);

            const firstTickValue = manager.getValue('HP' as GameParamId);
            expect(firstTickValue).toBeGreaterThan(0);
            expect(firstTickValue).toBeLessThan(100);

            manager.tick(0, 3000);
            manager.tick(0, 30);

            expect(manager.getValue('HP' as GameParamId)).toBe(100);
        });

        it('should interpolate value over time when decreasing (Release)', () => {
            manager.setValue('HP' as GameParamId, 100);

            manager.configureParam('HP' as GameParamId, 0, 1000);
            manager.setValue('HP' as GameParamId, 0);

            manager.tick(0, 30);

            const firstTickValue = manager.getValue('HP' as GameParamId);
            expect(firstTickValue).toBeLessThan(100);
            expect(firstTickValue).toBeGreaterThan(0);

            manager.tick(0, 3000);
            manager.tick(0, 30);

            expect(manager.getValue('HP' as GameParamId)).toBe(0);
        });

        it('should handle multiple parameters interpolating in the same tick', () => {
            manager.configureParam('P1' as GameParamId, 1000, 1000);
            manager.configureParam('P2' as GameParamId, 500, 500);

            manager.setValue('P1' as GameParamId, 100);
            manager.setValue('P2' as GameParamId, 50);

            manager.tick(0, 30);

            expect(manager.getValue('P1' as GameParamId)).toBeGreaterThan(0);
            expect(manager.getValue('P2' as GameParamId)).toBeGreaterThan(0);
        });

        it('should snap to target if difference is very small (< 1e-4)', () => {
            manager.configureParam('HP' as GameParamId, 1000, 1000);

            manager.setValue('HP' as GameParamId, 99.999_99);

            manager.configureParam('HP' as GameParamId, 0, 0);
            manager.setValue('HP' as GameParamId, 99.999_95);
            manager.configureParam('HP' as GameParamId, 1000, 1000);

            manager.setValue('HP' as GameParamId, 100);

            manager.tick(0, 30);

            expect(manager.getValue('HP' as GameParamId)).toBe(100);
        });

        it('should fallback to instant assignment if slewTimeMs becomes 0 mid-flight', () => {
            manager.configureParam('HP' as GameParamId, 1000, 1000);
            manager.setValue('HP' as GameParamId, 100);

            manager.tick(0, 30);

            manager.configureParam('HP' as GameParamId, 0, 0);

            manager.tick(0, 30);

            expect(manager.getValue('HP' as GameParamId)).toBe(100);
        });

        it('should sleep automatically (isInterpolating = false) when all interpolations finish', () => {
            manager.configureParam('HP' as GameParamId, 100, 100);
            manager.setValue('HP' as GameParamId, 10);

            expect((manager as any).isInterpolating).toBe(true);

            manager.tick(0, 500);
            manager.tick(0, 30);

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
            manager.configureParam('P1' as GameParamId, 1000, 1000);
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
            manager.configureParam('P1' as GameParamId, 1000, 1000);
            manager.setValue('P1' as GameParamId, 10);
            manager.setOverride('P1' as GameParamId, 88, true);
            manager.setValue('P1' as GameParamId, 50);
            (manager as any).isInterpolating = false;

            manager.resetOverrides();

            expect((manager as any).isInterpolating).toBe(true);
        });
    });
});
