import { describe, it, expect, vi, beforeEach } from 'vitest';

import MixerStateManager from '../MixerStateManager';

import type AudioBusSystem from '../../BusSystem/AudioBusSystem';
import type { MixerState } from '../../interfaces/IMixerStateManager';

describe('MixerStateManager', () => {
    let mockBusSystem: any;
    let mockBus: any;
    let mockAutomation: any;
    let mockRtpcManager: any;
    let manager: MixerStateManager;

    beforeEach(() => {
        vi.clearAllMocks();

        mockBus = {
            inputGainNode: { gain: {} },
            safeReplaceFilter: vi.fn().mockResolvedValue(true),
            bindRTPC: vi.fn()
        };

        mockBusSystem = {
            getBus: vi.fn().mockReturnValue(mockBus),
            applySend: vi.fn()
        } as unknown as AudioBusSystem;

        mockAutomation = {
            ramp: vi.fn()
        };

        mockRtpcManager = {};

        manager = new MixerStateManager(mockBusSystem, mockAutomation, mockRtpcManager);
    });

    it('should ramp gain and apply new RTPC configs when transitioning states', async () => {
        const nextState: MixerState = {
            buses: {
                music_bus: {
                    gain: 0.5,
                    sidechain: { enabled: false },
                    rtpc: {
                        gain: {
                            gameParam: 'intensity',
                            curve: [
                                { x: 0, y: 0.5 },
                                { x: 1, y: 1 }
                            ]
                        }
                    }
                }
            }
        };

        await manager.applyState(nextState, { durationMs: 1000 });

        expect(mockBusSystem.getBus).toHaveBeenCalledWith('music_bus');

        expect(mockAutomation.ramp).toHaveBeenCalledWith(mockBus.inputGainNode.gain, 0.5, 1000);

        expect(mockBus.bindRTPC).toHaveBeenCalledWith(nextState.buses.music_bus.rtpc, mockRtpcManager);

        expect(mockBus.logicalTargetGain).toBe(0.5);
    });

    it('should replace filter if filter config changes', async () => {
        const nextState: MixerState = {
            buses: {
                sfx_bus: {
                    gain: 1,
                    sidechain: { enabled: false },
                    filter: { type: 'lowpass', frequency: 1000, Q: 1 }
                }
            }
        };

        await manager.applyState(nextState, { durationMs: 500 });

        expect(mockBus.safeReplaceFilter).toHaveBeenCalledWith(nextState.buses.sfx_bus.filter, 125);
    });

    it('should trigger applies Sends if they exist in state', async () => {
        const nextState: MixerState = {
            buses: {
                sfx_bus: {
                    gain: 1,
                    sidechain: { enabled: false },
                    sends: { reverb_bus: 0.8 }
                }
            }
        };

        await manager.applyState(nextState, { durationMs: 500 });

        expect(mockBusSystem.applySend).toHaveBeenCalledWith('sfx_bus', 'reverb_bus', 0.8, 500);
    });

    it('should return a deep clone of current state via getState()', () => {
        const initialState = manager.getState();
        expect(initialState).toEqual({ buses: {} });

        const state = manager.getState();
        (state.buses as any).test = {};
        expect(manager.getState().buses).toEqual({});
    });

    describe('Transition Handling & FSM', () => {
        it('should interrupt active transition if a new one is started and interruptible is true', async () => {
            const state1: MixerState = { buses: { music: { gain: 0.1, sidechain: { enabled: false } } } };
            const state2: MixerState = { buses: { music: { gain: 0.9, sidechain: { enabled: false } } } };

            const p1 = manager.applyState(state1, { durationMs: 1000, interruptible: true });

            const p2 = manager.applyState(state2, { durationMs: 100 });

            await Promise.all([p1, p2]);

            expect(manager.getState().buses.music.gain).toBe(0.9);
            expect(mockAutomation.ramp).toHaveBeenCalledWith(expect.anything(), 0.9, 100);
        });

        it('should NOT interrupt if active transition is marked as NOT interruptible', async () => {
            const state1: MixerState = { buses: { music: { gain: 0.1, sidechain: { enabled: false } } } };
            const state2: MixerState = { buses: { music: { gain: 0.9, sidechain: { enabled: false } } } };

            const p1 = manager.applyState(state1, { durationMs: 1000, interruptible: false });

            const p2 = manager.applyState(state2, { durationMs: 100 });

            await Promise.all([p1, p2]);

            expect(manager.getState().buses.music.gain).toBe(0.1);
            expect(mockAutomation.ramp).not.toHaveBeenCalledWith(expect.anything(), 0.9, 100);
        });

        it('should exit runTransition early if transition was canceled mid-loop', async () => {
            const nextState: MixerState = {
                buses: {
                    bus1: { gain: 0.5, sidechain: { enabled: false } },
                    bus2: { gain: 0.5, sidechain: { enabled: false } }
                }
            };

            mockBusSystem.getBus.mockImplementation((id: string) => {
                if (id === 'bus2') {
                    (manager as any).cancelActiveTransition();
                }
                return mockBus;
            });

            await manager.applyState(nextState);

            expect(mockAutomation.ramp).toHaveBeenCalledTimes(1);
            expect(mockBusSystem.getBus).toHaveBeenCalledWith('bus2');
        });
    });
});
