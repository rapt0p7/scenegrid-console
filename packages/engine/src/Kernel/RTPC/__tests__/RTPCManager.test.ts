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
            manager.reset();

            expect(manager.getValue('MUSIC_VOLUME' as GameParamId, -1)).toBe(-1);
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
    });
});
