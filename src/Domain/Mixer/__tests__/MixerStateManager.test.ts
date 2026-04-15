// noinspection D
import { describe, it, expect, vi, beforeEach } from 'vitest';

import MixerStateManager from '@domain/Mixer/MixerStateManager.js';

describe('MixerStateManager (Tick-based FSM)', () => {
    let mockBusSystem: any;
    let mockBus: any;
    let manager: MixerStateManager;

    beforeEach(() => {
        vi.clearAllMocks();
        mockBus = {
            safeReplaceFilter: vi.fn(),
            bindRTPC: vi.fn(),
            setLogicalGain: vi.fn(),
            setGainImmediate: vi.fn()
        };
        mockBusSystem = {
            getBus: vi.fn().mockReturnValue(mockBus),
            getAllBuses: vi.fn().mockReturnValue(new Map([['music', mockBus]]))
        };
        manager = new MixerStateManager(mockBusSystem, {} as any);
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
});
