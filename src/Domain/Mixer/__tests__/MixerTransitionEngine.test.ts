// noinspection D

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { isFilterEqual } from '@domain/BusSystem/ValueObjects/filterEquals.js';
import MixerTransitionEngine from '@domain/Mixer/MixerTransitionEngine.js';

import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';

describe('Value Objects: isFilterEqual', () => {
    it('should return true for identical references or both null', () => {
        expect(isFilterEqual(null, null)).toBe(true);
        expect(isFilterEqual(undefined, undefined)).toBe(true);

        const filter = { type: 'lowpass', frequency: 1000, Q: 1 } as IFilter;
        expect(isFilterEqual(filter, filter)).toBe(true);
    });

    it('should return false if one is missing (null/undefined)', () => {
        const filter = { type: 'lowpass', frequency: 1000, Q: 1 } as IFilter;
        expect(isFilterEqual(filter, null)).toBe(false);
        expect(isFilterEqual(null, filter)).toBe(false);
    });

    it('should return false if filter types differ', () => {
        const a = { type: 'lowpass', frequency: 1000, Q: 1 } as IFilter;
        const b = { type: 'highpass', frequency: 1000, Q: 1 } as IFilter;
        expect(isFilterEqual(a, b)).toBe(false);
    });

    it('should correctly compare reverb filters', () => {
        const r1 = { type: 'reverb', reverbTime: 2, reverbDecay: 1 } as IFilter;
        const r2 = { type: 'reverb', reverbTime: 2, reverbDecay: 1 } as IFilter;
        const r3 = { type: 'reverb', reverbTime: 5, reverbDecay: 1 } as IFilter;

        expect(isFilterEqual(r1, r2)).toBe(true);
        expect(isFilterEqual(r1, r3)).toBe(false);
    });

    it('should correctly compare biquad (non-reverb) filters', () => {
        const b1 = { type: 'lowpass', frequency: 1000, Q: 1 } as IFilter;
        const b2 = { type: 'lowpass', frequency: 1000, Q: 1 } as IFilter;
        const b3 = { type: 'lowpass', frequency: 2000, Q: 1 } as IFilter;

        expect(isFilterEqual(b1, b2)).toBe(true);
        expect(isFilterEqual(b1, b3)).toBe(false);
    });
});

describe('MixerTransitionEngine (Tick-based FSM)', () => {
    let mockBusSystem: any;
    let mockBus: any;
    let manager: MixerTransitionEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        mockBus = {
            safeReplaceFilter: vi.fn(),
            bindRTPC: vi.fn(),
            setLogicalGain: vi.fn(),
            setGainImmediate: vi.fn()
        };
        mockBusSystem = {
            getBus: vi.fn(id => (id === 'missing' ? undefined : mockBus)),
            getAllBuses: vi.fn().mockReturnValue(new Map([['music', mockBus]])),
            applySend: vi.fn()
        };
        manager = new MixerTransitionEngine(mockBusSystem, {} as any);
    });

    it('should perform Cold Start (instant) on first applyState', () => {
        const state: any = { buses: { music: { gain: 0.5 } } };
        manager.applyState(state, { durationMs: 1000 });

        expect(mockBus.setGainImmediate).toHaveBeenCalledWith(0.5);
        expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
        expect(manager.getState().buses.music.gain).toBe(0.5);
    });

    describe('Normal Operations (After Cold Start)', () => {
        beforeEach(() => {
            manager.applyState({ buses: {} }, { durationMs: 0 });
            vi.clearAllMocks();
        });

        it('should wait for filter phase (25%) before applying gain', () => {
            const state: any = { buses: { music: { gain: 0.5 } } };
            manager.applyState(state, { durationMs: 1000 });

            expect(mockBus.setLogicalGain).not.toHaveBeenCalled();

            manager.update(250);
            expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.5, 750);
        });

        it('should calculate remaining time correctly when update hits late', () => {
            manager.applyState({ buses: { music: { gain: 0.8 } } }, { durationMs: 1000 });

            manager.update(300);
            expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.8, 700);
        });

        it('should finalize state only when duration is reached', () => {
            manager.applyState({ buses: { music: { gain: 1 } } }, { durationMs: 1000 });
            manager.update(999);
            expect(manager.getState().buses.music).toBeUndefined();

            manager.update(1);
            expect(manager.getState().buses.music.gain).toBe(1);
        });
    });

    describe('Interruptible Logic', () => {
        beforeEach(() => {
            manager.applyState({ buses: {} }, { durationMs: 0 });
            vi.clearAllMocks();
        });

        it('should interrupt active transition if interruptible is true', () => {
            manager.applyState({ buses: { music: { gain: 0.1 } } }, { durationMs: 1000 });
            manager.update(100);

            manager.applyState({ buses: { music: { gain: 0.9 } } }, { durationMs: 500 });

            manager.update(125);
            expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.9, 375);
        });

        it('should NOT interrupt if current transition is locked', () => {
            manager.applyState({ buses: { music: { gain: 0.1 } } }, { durationMs: 1000, interruptible: false });
            manager.update(100);

            manager.applyState({ buses: { music: { gain: 0.9 } } }, { durationMs: 500 });

            manager.update(200);
            expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.1, 700);
        });
    });

    describe('Coverage Edge Cases & Branches', () => {
        beforeEach(() => {
            manager.applyState({ buses: {} }, { durationMs: 0 });
            vi.clearAllMocks();
        });

        it('should return early on update if IDLE', () => {
            manager.update(100);
            expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
        });

        it('should handle cancelActiveTransition correctly', () => {
            manager.cancelActiveTransition();

            manager.applyState({ buses: { music: { gain: 0.5 } } }, { durationMs: 1000 });
            manager.cancelActiveTransition();

            manager.update(300);
            expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
        });

        it('should ignore absent buses in startFilterPhase (continue branch)', () => {
            manager.applyState({ buses: { missing: { gain: 1 } } }, { durationMs: 1000 });
            expect(mockBus.safeReplaceFilter).not.toHaveBeenCalled();
        });

        it('should trigger filter replacement and bind RTPC', () => {
            const filter = { type: 'lowpass', frequency: 1000, Q: 1 } as IFilter;

            const rtpc = { gain: { gameParam: 'tension' } } as any;

            manager.applyState({ buses: { music: { gain: 1, filter, rtpc } } }, { durationMs: 1000 });

            expect(mockBus.safeReplaceFilter).toHaveBeenCalledWith(filter, 250);
            expect(mockBus.bindRTPC).toHaveBeenCalledWith(rtpc, expect.anything());
        });

        it('should apply sends when defined in target config', () => {
            manager.applyState({ buses: { music: { gain: 1, sends: { reverb: 0.5 } } } }, { durationMs: 1000 });

            manager.update(250);

            expect(mockBusSystem.applySend).toHaveBeenCalledWith('music', 'reverb', 0.5, 750);
        });

        it('should clear old sends when absent in new target config', () => {
            manager.applyState({ buses: { music: { gain: 1, sends: { reverb: 0.5 } } } }, { durationMs: 0 });
            mockBusSystem.applySend.mockClear();

            manager.applyState({ buses: { music: { gain: 1 } } }, { durationMs: 1000 });
            manager.update(250);

            expect(mockBusSystem.applySend).toHaveBeenCalledWith('music', 'reverb', null, 750);
        });
    });
});
