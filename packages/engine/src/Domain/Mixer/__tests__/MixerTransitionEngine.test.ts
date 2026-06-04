// noinspection D

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { isFilterEqual } from '@domain/BusSystem/ValueObjects/filterEquals.js';
import MixerTransitionEngine from '@domain/Mixer/MixerTransitionEngine.js';

import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { BusId } from '@scene-grid/shared';

describe('Value Objects: isFilterEqual', () => {
    it('should return true for identical references or both null', () => {
        expect(isFilterEqual(null, null)).toBe(true);
        // oxlint-disable-next-line unicorn/no-useless-undefined
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
        expect(manager.getState().buses['music' as BusId].gain).toBe(0.5);
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

            manager.tick(0, 250);
            expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.5, 750);
        });

        it('should calculate remaining time correctly when update hits late', () => {
            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.8 } } }, { durationMs: 1000 });

            manager.tick(0, 300);
            expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.8, 700);
        });

        it('should finalize state only when duration is reached', () => {
            manager.applyState({ buses: { ['music' as BusId]: { gain: 1 } } }, { durationMs: 1000 });
            manager.tick(0, 999);
            expect(manager.getState().buses['music' as BusId]).toBeUndefined();

            manager.tick(0, 1);
            expect(manager.getState().buses['music' as BusId].gain).toBe(1);
        });
    });

    describe('Interruptible Logic', () => {
        beforeEach(() => {
            manager.applyState({ buses: {} }, { durationMs: 0 });
            vi.clearAllMocks();
        });

        it('should interrupt active transition if interruptible is true', () => {
            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.1 } } }, { durationMs: 1000 });
            manager.tick(0, 100);

            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.9 } } }, { durationMs: 500 });

            manager.tick(0, 125);
            expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.9, 375);
        });

        it('should NOT interrupt if current transition is locked', () => {
            manager.applyState(
                { buses: { ['music' as BusId]: { gain: 0.1 } } },
                { durationMs: 1000, interruptible: false }
            );
            manager.tick(0, 100);

            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.9 } } }, { durationMs: 500 });

            manager.tick(0, 200);
            expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.1, 700);
        });
    });

    describe('Coverage Edge Cases & Branches', () => {
        beforeEach(() => {
            manager.applyState({ buses: {} }, { durationMs: 0 });
            vi.clearAllMocks();
        });

        it('should return early on update if IDLE', () => {
            manager.tick(0, 100);
            expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
        });

        it('should handle cancelActiveTransition correctly', () => {
            manager.cancelActiveTransition();

            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.5 } } }, { durationMs: 1000 });
            manager.cancelActiveTransition();

            manager.tick(0, 300);
            expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
        });

        it('should ignore absent buses in startFilterPhase (continue branch)', () => {
            manager.applyState({ buses: { ['missing' as BusId]: { gain: 1 } } }, { durationMs: 1000 });
            expect(mockBus.safeReplaceFilter).not.toHaveBeenCalled();
        });

        it('should trigger filter replacement and bind RTPC', () => {
            const filter = { type: 'lowpass', frequency: 1000, Q: 1 } as IFilter;

            const rtpc = { gain: { gameParam: 'tension' } } as any;

            manager.applyState({ buses: { ['music' as BusId]: { gain: 1, filter, rtpc } } }, { durationMs: 1000 });

            expect(mockBus.safeReplaceFilter).toHaveBeenCalledWith(filter, 250);
            expect(mockBus.bindRTPC).toHaveBeenCalledWith(rtpc, expect.anything());
        });

        it('should apply sends when defined in target config', () => {
            manager.applyState(
                { buses: { ['music' as BusId]: { gain: 1, sends: { ['reverb' as BusId]: 0.5 } } } },
                { durationMs: 1000 }
            );

            manager.tick(0, 250);

            expect(mockBusSystem.applySend).toHaveBeenCalledWith('music', 'reverb', 0.5, 750);
        });

        it('should clear old sends when absent in new target config', () => {
            manager.applyState(
                { buses: { ['music' as BusId]: { gain: 1, sends: { ['reverb' as BusId]: 0.5 } } } },
                { durationMs: 0 }
            );
            mockBusSystem.applySend.mockClear();

            manager.applyState({ buses: { ['music' as BusId]: { gain: 1 } } }, { durationMs: 1000 });
            manager.tick(0, 250);

            expect(mockBusSystem.applySend).toHaveBeenCalledWith('music', 'reverb', null, 750);
        });
    });
});

describe('Bug repro: Sends and Reverb retention across snapshots', () => {
    let mockBusSystem: any;
    let manager: MixerTransitionEngine;
    let mockSfxBus: any;
    let mockReverbBus: any;

    beforeEach(() => {
        vi.clearAllMocks();

        const baseConfig = {
            ['FX_REVERB' as BusId]: { gain: 1, filter: { type: 'reverb' as any, reverbTime: 2.5 } },
            ['SFX_COINS' as BusId]: { gain: 1, sends: { ['FX_REVERB' as BusId]: 0.5 } }
        };

        mockSfxBus = {
            safeReplaceFilter: vi.fn(),
            setGainImmediate: vi.fn(),
            setLogicalGain: vi.fn(),
            config: baseConfig.SFX_COINS
        };
        mockReverbBus = {
            safeReplaceFilter: vi.fn(),
            setGainImmediate: vi.fn(),
            setLogicalGain: vi.fn(),
            config: baseConfig.FX_REVERB
        };

        mockBusSystem = {
            getBus: vi.fn(id => (id === 'SFX_COINS' ? mockSfxBus : id === 'FX_REVERB' ? mockReverbBus : undefined)),
            getAllBuses: vi.fn().mockReturnValue(
                new Map([
                    ['SFX_COINS', mockSfxBus],
                    ['FX_REVERB', mockReverbBus]
                ])
            ),
            applySend: vi.fn(),
            getBaseBusConfig: vi.fn(id => baseConfig[id])
        };

        manager = new MixerTransitionEngine(mockBusSystem, { getValue: vi.fn() } as any);
    });

    it('should NOT drop base filters and sends when snapshot omits them (idle -> explore -> idle)', () => {
        const idleSnapshot = {
            buses: { ['SFX_COINS' as BusId]: { gain: 1 } }
        };

        manager.applyState(idleSnapshot, { durationMs: 1000 });
        manager.tick(0, 250);

        expect(mockReverbBus.safeReplaceFilter).not.toHaveBeenCalledWith(null, expect.anything());
        expect(mockReverbBus.safeReplaceFilter).not.toHaveBeenCalledWith(undefined, expect.anything());

        expect(mockBusSystem.applySend).not.toHaveBeenCalledWith('SFX_COINS', 'FX_REVERB', null, expect.anything());
        expect(mockBusSystem.applySend).not.toHaveBeenCalledWith(
            'SFX_COINS',
            'FX_REVERB',
            undefined,
            expect.anything()
        );

        const exploreSnapshot = { buses: {} };
        manager.applyState(exploreSnapshot, { durationMs: 1000 });
        manager.tick(0, 500);

        expect(mockReverbBus.safeReplaceFilter).not.toHaveBeenCalledWith(null, expect.anything());
        expect(mockBusSystem.applySend).not.toHaveBeenCalledWith('SFX_COINS', 'FX_REVERB', null, expect.anything());
    });
});
