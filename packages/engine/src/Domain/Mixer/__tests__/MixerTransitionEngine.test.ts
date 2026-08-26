// noinspection D

import type { IFilter } from '@domain/BusSystem/Ports/IFilter.js';
import type { BusId, Milliseconds } from '@scene-grid/shared';

import { isFilterEqual } from '@domain/BusSystem/ValueObjects/filterEquals.js';
import MixerTransitionEngine from '@domain/Mixer/MixerTransitionEngine.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('MixerTransitionEngine', () => {
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
            applySend: vi.fn(),
            getBaseBusConfig: vi.fn()
        };
        manager = new MixerTransitionEngine(mockBusSystem, {} as any);
    });

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

        it('should return false if filter parameters differ', () => {
            const a = { type: 'lowpass', frequency: 1000, Q: 1 } as IFilter;
            const b = { type: 'lowpass', frequency: 1100, Q: 1 } as IFilter;
            expect(isFilterEqual(a, b)).toBe(false);
        });
    });

    describe('MixerTransitionEngine (Tick-based FSM)', () => {
        it('should perform Cold Start (instant) on first applyState', () => {
            const state: any = { buses: { music: { gain: 0.5 } } };
            manager.applyState(state, { duration: 1000 as Milliseconds });

            expect(mockBus.setGainImmediate).toHaveBeenCalledWith(0.5);
            expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
            expect(manager.getState().buses['music' as BusId].gain).toBe(0.5);
        });

        describe('Normal Operations (After Cold Start)', () => {
            beforeEach(() => {
                manager.applyState({ buses: {} }, { duration: 0 as Milliseconds });
                vi.clearAllMocks();
            });

            it('should wait for filter phase (25%) before applying gain', () => {
                const state: any = { buses: { music: { gain: 0.5 } } };
                manager.applyState(state, { duration: 1000 as Milliseconds });

                expect(mockBus.setLogicalGain).not.toHaveBeenCalled();

                manager.tick(0, 250 as Milliseconds);
                expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.5, 750);
            });

            it('should calculate remaining time correctly when update hits late', () => {
                manager.applyState(
                    { buses: { ['music' as BusId]: { gain: 0.8 } } },
                    { duration: 1000 as Milliseconds }
                );

                manager.tick(0, 300 as Milliseconds);
                expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.8, 700);
            });

            it('should finalize state only when duration is reached', () => {
                manager.applyState({ buses: { ['music' as BusId]: { gain: 1 } } }, { duration: 1000 as Milliseconds });
                manager.tick(0, 999 as Milliseconds);
                expect(manager.getState().buses['music' as BusId]).toBeUndefined();

                manager.tick(0, 1 as Milliseconds);
                expect(manager.getState().buses['music' as BusId].gain).toBe(1);
            });
        });

        describe('Interruptible Logic', () => {
            beforeEach(() => {
                manager.applyState({ buses: {} }, { duration: 0 as Milliseconds });
                vi.clearAllMocks();
            });

            it('should interrupt active transition if interruptible is true', () => {
                manager.applyState(
                    { buses: { ['music' as BusId]: { gain: 0.1 } } },
                    { duration: 1000 as Milliseconds }
                );
                manager.tick(0, 100 as Milliseconds);

                manager.applyState({ buses: { ['music' as BusId]: { gain: 0.9 } } }, { duration: 500 as Milliseconds });

                manager.tick(0, 125 as Milliseconds);
                expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.9, 375);
            });

            it('should NOT interrupt if current transition is locked', () => {
                manager.applyState(
                    { buses: { ['music' as BusId]: { gain: 0.1 } } },
                    { duration: 1000 as Milliseconds, interruptible: false }
                );
                manager.tick(0, 100 as Milliseconds);

                manager.applyState({ buses: { ['music' as BusId]: { gain: 0.9 } } }, { duration: 500 as Milliseconds });

                manager.tick(0, 200 as Milliseconds);
                expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.1, 700);
            });
        });

        describe('Coverage Edge Cases & Branches', () => {
            beforeEach(() => {
                manager.applyState({ buses: {} }, { duration: 0 as Milliseconds });
                vi.clearAllMocks();
            });

            it('should return early on update if IDLE', () => {
                manager.tick(0, 100 as Milliseconds);
                expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
            });

            it('should handle cancelActiveTransition correctly', () => {
                manager.cancelActiveTransition();

                manager.applyState(
                    { buses: { ['music' as BusId]: { gain: 0.5 } } },
                    { duration: 1000 as Milliseconds }
                );
                manager.cancelActiveTransition();

                manager.tick(0, 300 as Milliseconds);
                expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
            });

            it('should ignore absent buses in startFilterPhase (continue branch)', () => {
                manager.applyState(
                    { buses: { ['missing' as BusId]: { gain: 1 } } },
                    { duration: 1000 as Milliseconds }
                );
                expect(mockBus.safeReplaceFilter).not.toHaveBeenCalled();
            });

            it('should trigger filter replacement and bind RTPC', () => {
                const filter = { type: 'lowpass', frequency: 1000, Q: 1 } as IFilter;

                const rtpc = { gain: { gameParam: 'tension' } } as any;

                manager.applyState(
                    { buses: { ['music' as BusId]: { gain: 1, filter, rtpc } } },
                    { duration: 1000 as Milliseconds }
                );

                expect(mockBus.safeReplaceFilter).toHaveBeenCalledWith(filter, 250);
                expect(mockBus.bindRTPC).toHaveBeenCalledWith(rtpc, expect.anything());
            });

            it('should apply sends when defined in target config', () => {
                manager.applyState(
                    { buses: { ['music' as BusId]: { gain: 1, sends: { ['reverb' as BusId]: 0.5 } } } },
                    { duration: 1000 as Milliseconds }
                );

                manager.tick(0, 250 as Milliseconds);

                expect(mockBusSystem.applySend).toHaveBeenCalledWith('music', 'reverb', 0.5, 750);
            });

            it('should clear old sends when absent in new target config', () => {
                manager.applyState(
                    { buses: { ['music' as BusId]: { gain: 1, sends: { ['reverb' as BusId]: 0.5 } } } },
                    { duration: 0 as Milliseconds }
                );
                mockBusSystem.applySend.mockClear();

                manager.applyState({ buses: { ['music' as BusId]: { gain: 1 } } }, { duration: 1000 as Milliseconds });
                manager.tick(0, 250 as Milliseconds);

                expect(mockBusSystem.applySend).toHaveBeenCalledWith('music', 'reverb', null, 750);
            });
        });
    });

    describe('Bug repro: Sends and Reverb retention across snapshots', () => {
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

            manager.applyState(idleSnapshot, { duration: 1000 as Milliseconds });
            manager.tick(0, 250 as Milliseconds);

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
            manager.applyState(exploreSnapshot, { duration: 1000 as Milliseconds });
            manager.tick(0, 500 as Milliseconds);

            expect(mockReverbBus.safeReplaceFilter).not.toHaveBeenCalledWith(null, expect.anything());
            expect(mockBusSystem.applySend).not.toHaveBeenCalledWith('SFX_COINS', 'FX_REVERB', null, expect.anything());
        });
    });

    describe('MixerTransitionEngine.applyState and getState', () => {
        it('should return consistent state after applyState', () => {
            mockBus = {
                safeReplaceFilter: vi.fn(),
                bindRTPC: vi.fn(),
                setLogicalGain: vi.fn(),
                setGainImmediate: vi.fn()
            };
            mockBusSystem = {
                getBus: vi.fn(id => (id === 'music' ? mockBus : undefined)),
                getAllBuses: vi.fn().mockReturnValue(new Map([['music', mockBus]])),
                applySend: vi.fn()
            };
            const mockRTPC = { setRTPC: vi.fn() } as any;
            const engine = new MixerTransitionEngine(mockBusSystem, mockRTPC);

            const nextState = { buses: { music: { gain: 0.5 } } };
            engine.applyState(nextState);

            const state = engine.getState();
            expect(state).toEqual(nextState);
        });
    });

    describe('MixerTransitionEngine.getState during transition', () => {
        it('should reflect the base state during an active transition', () => {
            mockBus = {
                safeReplaceFilter: vi.fn(),
                bindRTPC: vi.fn(),
                setLogicalGain: vi.fn(),
                setGainImmediate: vi.fn()
            };
            mockBusSystem = {
                getBus: vi.fn(id => (id === 'music' ? mockBus : undefined)),
                getAllBuses: vi.fn().mockReturnValue(new Map([['music', mockBus]])),
                applySend: vi.fn()
            };
            const mockRTPC = { setRTPC: vi.fn() } as any;
            const engine = new MixerTransitionEngine(mockBusSystem, mockRTPC);

            engine.applyState({ buses: { ['music' as BusId]: { gain: 0 } } });
            engine.applyState({ buses: { ['music' as BusId]: { gain: 1 } } }, { duration: 1000 as Milliseconds });

            const state = engine.getState();
            expect(state.buses['music' as BusId].gain).toBe(0);
        });
    });

    describe('MixerTransitionEngine.applyState - bus target gain & events', () => {
        it('should set logicalTargetGain on target buses and emit transition:start event', () => {
            const listener = vi.fn();
            manager.events.on('transition:start', listener);
            const state = { buses: { music: { gain: 0.8 } } };

            manager.applyState(state, { duration: 1000 as Milliseconds });

            expect(mockBus.logicalTargetGain).toBe(0.8);

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith({ duration: 1000 });
        });

        it('should set logicalTargetGain to 0 when gain is omitted in bus config', () => {
            const state = { buses: { music: {} as any } };

            manager.applyState(state, { duration: 1000 as Milliseconds });

            expect(mockBus.logicalTargetGain).toBe(0);
        });
    });

    describe('MixerTransitionEngine.cancelActiveTransition', () => {
        it('should not recreate state object when called while already IDLE', () => {
            const initialState = (manager as any).state;

            manager.cancelActiveTransition();

            expect((manager as any).state).toBe(initialState);
        });

        it('should reset FSM state to IDLE allowing subsequent transitions to be applied', () => {
            manager.applyState({ buses: {} }, { duration: 0 as Milliseconds });
            manager.applyState(
                { buses: { ['music' as BusId]: { gain: 0.2 } } },
                { duration: 1000 as Milliseconds, interruptible: false }
            );

            manager.cancelActiveTransition();
            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.9 } } }, { duration: 500 as Milliseconds });

            expect((manager as any).state.type).toBe('FADE_OUT_FILTERS');
            expect(mockBus.logicalTargetGain).toBe(0.9);
        });
    });

    describe('MixerTransitionEngine.tick - IDLE guard', () => {
        it('should return immediately when tick is called in IDLE state without modifying state', () => {
            const initialState = (manager as any).state;

            manager.tick(0, 100 as Milliseconds);

            expect((manager as any).state).toBe(initialState);
            expect((manager as any).state.elapsed).toBeUndefined();
        });
    });

    describe('MixerTransitionEngine.tick - transition phase FSM', () => {
        beforeEach(() => {
            manager.applyState({ buses: {} }, { duration: 0 as Milliseconds });
            vi.clearAllMocks();
        });

        it('should not start main transition phase during filter phase ticks', () => {
            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.8 } } }, { duration: 1000 as Milliseconds });

            manager.tick(0, 100 as Milliseconds);

            expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
        });

        it('should transition state type to RUNNING_TRANSITION and trigger main transition phase only once', () => {
            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.8 } } }, { duration: 1000 as Milliseconds });

            manager.tick(0, 250 as Milliseconds);

            expect((manager as any).state.type).toBe('RUNNING_TRANSITION');
            expect(mockBus.setLogicalGain).toHaveBeenCalledTimes(1);

            vi.clearAllMocks();
            manager.tick(0, 100 as Milliseconds);

            expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
        });
    });

    describe('MixerTransitionEngine.forceInstantTransition - base config & sends', () => {
        it('should use baseConfig gain when target bus config omits gain during instant transition', () => {
            mockBusSystem.getBaseBusConfig.mockReturnValue({ gain: 0.6 });

            manager.applyState({ buses: { ['music' as BusId]: {} as any } }, { duration: 0 as Milliseconds });

            expect(mockBus.setGainImmediate).toHaveBeenCalledWith(0.6);
        });

        it('should apply sends specified in target config during instant transition', () => {
            const state = {
                buses: {
                    music: { sends: { reverb: 0.4 as any } as any }
                }
            };

            manager.applyState(state, { duration: 0 as Milliseconds });

            expect(mockBusSystem.applySend).toHaveBeenCalledWith('music', 'reverb', 0.4, 0);
        });
    });

    describe('MixerTransitionEngine.startMainTransitionPhase - gain logic', () => {
        beforeEach(() => {
            manager.applyState({ buses: {} }, { duration: 0 as Milliseconds });
            vi.clearAllMocks();
        });

        it('should fall back to baseConfig gain for nextGain during main transition phase', () => {
            manager.applyState({ buses: { ['music' as BusId]: { gain: 0 } } }, { duration: 0 as Milliseconds });
            mockBusSystem.getBaseBusConfig.mockReturnValue({ gain: 0.7 });
            vi.clearAllMocks();

            manager.applyState({ buses: { ['music' as BusId]: {} as any } }, { duration: 1000 as Milliseconds });
            manager.tick(0, 250 as Milliseconds);

            expect(mockBus.setLogicalGain).toHaveBeenCalledWith(0.7, 750);
        });

        it('should not call setLogicalGain when nextGain equals previousGain', () => {
            mockBusSystem.getBaseBusConfig.mockReturnValue({ gain: 0.5 });
            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.5 } } }, { duration: 0 as Milliseconds });
            vi.clearAllMocks();

            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.5 } } }, { duration: 1000 as Milliseconds });
            manager.tick(0, 250 as Milliseconds);

            expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
        });

        it('should correctly evaluate previousGain from baseConfig when previous gain was omitted', () => {
            mockBusSystem.getBaseBusConfig.mockReturnValue({ gain: 0.5 });
            (manager as any).current = { buses: { music: {} as any } };

            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.5 } } }, { duration: 1000 as Milliseconds });
            manager.tick(0, 250 as Milliseconds);

            expect(mockBus.setLogicalGain).not.toHaveBeenCalled();
        });
    });

    describe('MixerTransitionEngine.completeTransition', () => {
        it('should set state to IDLE and mark engine as initialized upon completion', () => {
            manager.applyState({ buses: {} }, { duration: 0 as Milliseconds });
            vi.clearAllMocks();

            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.8 } } }, { duration: 1000 as Milliseconds });

            manager.tick(0, 1000 as Milliseconds);

            expect((manager as any).state).toEqual({ type: 'IDLE' });

            vi.clearAllMocks();
            manager.applyState({ buses: { ['music' as BusId]: { gain: 0.3 } } }, { duration: 500 as Milliseconds });

            expect((manager as any).state.type).toBe('FADE_OUT_FILTERS');
            expect(mockBus.setGainImmediate).not.toHaveBeenCalled();
        });
    });
});
