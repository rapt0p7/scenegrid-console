// noinspection D
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import AudioBus from '@infrastructure/busSystem/AudioBus.js';

import type { BusId, GameParamId } from '@scene-grid/shared';
import type { AudioCtx, AutomationEngine, GainNodeLike, IPluginFactory } from '@infrastructure';

function createMockContext() {
    const mockNode = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 }
    };

    return {
        createGain: vi.fn().mockReturnValue({ ...mockNode }),
        createDynamicsCompressor: vi.fn().mockReturnValue({ ...mockNode, isNativeFallback: true }),
        state: 'running'
    } as any;
}

describe('AudioBus (Filters, Sends, RTPC - Pull Model)', () => {
    let mockContext: any;
    let mockAutomation: any;
    let mockPluginFactory: any;
    let mockMasterGain: any;
    let mockRtpcManager: any;

    beforeEach(() => {
        vi.useFakeTimers();

        mockContext = {
            currentTime: 0,
            createGain: vi.fn().mockImplementation(() => ({
                gain: { value: 1 },
                connect: vi.fn(),
                disconnect: vi.fn()
            }))
        };

        mockAutomation = {
            ramp: vi.fn(),
            set: vi.fn()
        };

        mockPluginFactory = {
            getFiltersPlugin: vi.fn().mockReturnValue({
                createNode: vi.fn().mockReturnValue({
                    frequency: { value: 22_000 },
                    Q: { value: 1 },
                    type: 'lowpass',
                    connect: vi.fn(),
                    disconnect: vi.fn()
                })
            })
        };

        mockMasterGain = { gain: { value: 1 }, connect: vi.fn() };

        mockRtpcManager = {
            getValue: vi.fn().mockReturnValue(0)
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should safely replace filter (fade out -> rebuild -> fade in)', () => {
        const bus = new AudioBus({
            id: 'sfx_bus' as BusId,
            config: { gain: 1 },
            context: mockContext as AudioCtx,
            automation: mockAutomation as AutomationEngine,
            routerMasterGain: mockMasterGain as GainNodeLike,
            pluginFactory: mockPluginFactory as IPluginFactory
        });

        bus.safeReplaceFilter({ type: 'highpass', frequency: 500 }, 10);

        expect(mockAutomation.ramp).toHaveBeenCalledWith(expect.any(Object), 0, 10, 'linear');

        mockContext.currentTime = 0.015;

        bus.processFrame(mockContext.currentTime);

        expect(mockPluginFactory.getFiltersPlugin().createNode).toHaveBeenCalled();
        expect(mockAutomation.ramp).toHaveBeenCalledWith(expect.any(Object), 1, 10, 'linear');
        expect(bus.getConfig().filter).toBeDefined();
    });

    it('should correctly disconnect and remove filter when null is passed', () => {
        const bus = new AudioBus({
            id: 'sfx_bus' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockMasterGain,
            pluginFactory: mockPluginFactory
        });

        bus.safeReplaceFilter({ type: 'lowpass', frequency: 500 }, 5);
        mockContext.currentTime += 0.01;
        bus.processFrame(mockContext.currentTime);

        expect(bus.getConfig().filter).toBeDefined();

        bus.safeReplaceFilter(null, 5);
        mockContext.currentTime += 0.01;
        bus.processFrame(mockContext.currentTime);

        expect(bus.getConfig().filter).toBeUndefined();
    });

    it('should fade out and disconnect send when targetGain is null', () => {
        const bus = new AudioBus({
            id: 'sfx_bus' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockMasterGain,
            pluginFactory: mockPluginFactory
        });

        const mockTargetNode = { connect: vi.fn(), disconnect: vi.fn() } as any;

        bus.updateSend({
            targetBusId: 'reverb_bus' as BusId,
            targetNode: mockTargetNode,
            targetGain: 0.5,
            durationMs: 0
        });
        bus.processFrame(mockContext.currentTime);

        bus.updateSend({
            targetBusId: 'reverb_bus' as BusId,
            targetNode: mockTargetNode,
            targetGain: null,
            durationMs: 100
        });
        bus.processFrame(mockContext.currentTime);

        expect(mockAutomation.ramp).toHaveBeenCalledWith(expect.any(Object), 0, 100, 'linear');

        vi.advanceTimersByTime(160);

        const sendGainsMap = (bus as any).sendGains as Map<string, any>;
        expect(sendGainsMap.has('reverb_bus')).toBe(false);
    });

    it('should calculate additive math correctly using Pull Model (tickRTPC)', () => {
        const bus = new AudioBus({
            id: 'sfx_bus' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockMasterGain,
            pluginFactory: mockPluginFactory
        });

        (bus as any).filterNode = { frequency: { value: 1000 } };
        (bus as any).pannerNode = { pan: { value: 0 } };

        mockAutomation.ramp.mockClear();

        (bus as any).targetParams.filterFrequency.logical = 1000;
        (bus as any).targetParams.pan.logical = 0;

        mockRtpcManager.getValue.mockReturnValue(100);

        bus.bindRTPC({
            filterFrequency: {
                gameParam: 'speed' as GameParamId,
                curve: [
                    { x: 0, y: 0 },
                    { x: 100, y: 500 }
                ]
            },
            pan: {
                gameParam: 'position' as GameParamId,
                curve: [
                    { x: -1, y: -1 },
                    { x: 100, y: 0.5 }
                ]
            }
        });

        bus.tickRTPC(mockRtpcManager);
        bus.processFrame(mockContext.currentTime);

        expect(mockRtpcManager.getValue).toHaveBeenCalledWith('speed');
        expect(mockRtpcManager.getValue).toHaveBeenCalledWith('position');
        expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).filterNode.frequency, 1500, 50, 'exponential');
        expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).pannerNode.pan, 0.5, 50, 'linear');
    });

    it('should pull RTPC for sendLevel and automate send gain when gameParam changes', () => {
        const bus = new AudioBus({
            id: 'sfx_bus' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockMasterGain,
            pluginFactory: mockPluginFactory
        });

        const mockTargetNode = { connect: vi.fn(), disconnect: vi.fn() } as any;

        bus.updateSend({
            targetBusId: 'reverb_bus' as BusId,
            targetNode: mockTargetNode,
            targetGain: 1,
            durationMs: 0
        });
        bus.processFrame(mockContext.currentTime);

        mockAutomation.ramp.mockClear();
        mockRtpcManager.getValue.mockReturnValue(100);

        bus.bindRTPC({
            sendLevel: {
                sendTargetBus: 'reverb_bus' as BusId,
                gameParam: 'cave_depth' as GameParamId,
                curve: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0.8 }
                ],
                smoothingMs: 200
            }
        });

        bus.tickRTPC(mockRtpcManager);
        bus.processFrame(mockContext.currentTime);

        const sendGainsMap = (bus as any).sendGains as Map<string, any>;
        const reverbSendGainNode = sendGainsMap.get('reverb_bus');

        expect(mockRtpcManager.getValue).toHaveBeenCalledWith('cave_depth');
        expect(mockAutomation.ramp).toHaveBeenCalledWith(reverbSendGainNode.gain, 0.8, 200, 'linear');
    });

    it('should safely ignore missing sendTargetBus and safely cache RTPC modifiers for uninitialized sends', () => {
        const bus = new AudioBus({
            id: 'sfx_bus' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockMasterGain,
            pluginFactory: mockPluginFactory
        });

        mockRtpcManager.getValue.mockReturnValue(100);

        expect(() => {
            bus.bindRTPC({
                sendLevel: {
                    gameParam: 'depth' as GameParamId,
                    curve: [{ x: 100, y: 0.5 }]
                }
            });
            bus.tickRTPC(mockRtpcManager);
        }).not.toThrow();

        bus.bindRTPC({
            sendLevel: {
                sendTargetBus: 'ghost_bus' as BusId,
                gameParam: 'depth' as GameParamId,
                curve: [{ x: 100, y: 0.5 }]
            }
        });

        bus.tickRTPC(mockRtpcManager);
        bus.processFrame(mockContext.currentTime);

        const ghostBusState = (bus as any).targetParams.sends.get('ghost_bus');
        expect(ghostBusState).toBeDefined();
        expect(ghostBusState.logical).toBe(0);
        expect(ghostBusState.rtpc).toBe(0.5);
    });

    it('should bind RTPC using preset curves and calculate math correctly on pull', () => {
        const bus = new AudioBus({
            id: 'sfx_bus' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockMasterGain,
            pluginFactory: mockPluginFactory
        });

        (bus as any).filterNode = { frequency: { value: 1000 } };
        mockAutomation.ramp.mockClear();

        (bus as any).targetParams.filterFrequency.logical = 1000;

        mockRtpcManager.getValue.mockReturnValue(50);

        bus.bindRTPC({
            filterFrequency: {
                gameParam: 'speed' as GameParamId,
                curve: {
                    type: 's-curve',
                    minX: 0,
                    maxX: 100,
                    minY: 0,
                    maxY: 2000
                }
            }
        });

        bus.tickRTPC(mockRtpcManager);
        bus.processFrame(mockContext.currentTime);

        expect(mockRtpcManager.getValue).toHaveBeenCalledWith('speed');
        expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).filterNode.frequency, 2000, 50, 'exponential');
    });

    describe('coldStart() initialization logic', () => {
        it('should connect pre to post directly if no filter is configured', () => {
            const bus = new AudioBus({
                id: 'bus' as BusId,
                config: { gain: 1 },
                context: mockContext,
                automation: mockAutomation,
                routerMasterGain: mockMasterGain,
                pluginFactory: mockPluginFactory
            });

            expect(bus.duckerTapNode.connect).toHaveBeenCalledWith(expect.any(Object));
            expect((bus as any).filterNode).toBeNull();
        });

        it('should create and connect a Biquad filter if configured, and cache its parameters', () => {
            const bus = new AudioBus({
                id: 'bus' as BusId,
                config: { gain: 1, filter: { type: 'lowpass', frequency: 22_000 } },
                context: mockContext,
                automation: mockAutomation,
                routerMasterGain: mockMasterGain,
                pluginFactory: mockPluginFactory
            });

            const filterNode = (bus as any).filterNode;
            expect(filterNode).toBeDefined();

            expect(bus.duckerTapNode.connect).toHaveBeenCalledWith(filterNode);
            expect(filterNode.connect).toHaveBeenCalledWith(expect.any(Object));

            expect(bus.getConfig().filter).toEqual({
                type: 'lowpass',
                frequency: 22_000,
                Q: 1
            });
        });

        it('should fallback to direct connection and delete config.filter if filter creation fails', () => {
            mockPluginFactory.getFiltersPlugin().createNode.mockReturnValueOnce(null);

            const bus = new AudioBus({
                id: 'bus' as BusId,
                config: { gain: 1, filter: { type: 'lowpass', frequency: 22_000 } },
                context: mockContext,
                automation: mockAutomation,
                routerMasterGain: mockMasterGain,
                pluginFactory: mockPluginFactory
            });

            expect((bus as any).filterNode).toBeNull();
            expect(bus.duckerTapNode.connect).toHaveBeenCalledWith(expect.any(Object));
            expect(bus.getConfig().filter).toBeUndefined();
        });
    });

    describe('setLogicalGain() logic', () => {
        it('should update logical gain, set isDirty, and automate inputGainNode on tick', () => {
            const bus = new AudioBus({
                id: 'bus' as BusId,
                config: { gain: 1 },
                context: mockContext,
                automation: mockAutomation,
                routerMasterGain: mockMasterGain,
                pluginFactory: mockPluginFactory
            });

            mockAutomation.ramp.mockClear();

            bus.setLogicalGain(0.5, 100);
            expect((bus as any).targetParams.gain.logical).toBe(0.5);

            bus.processFrame(mockContext.currentTime);

            expect(mockAutomation.ramp).toHaveBeenCalledWith(bus.inputNode.gain, 0.5, 100, 'linear');
            expect((bus as any).targetParams.gain.durationMs).toBe(0);
        });

        it('should use Math.max for durationMs when called multiple times before flush', () => {
            const bus = new AudioBus({
                id: 'bus' as BusId,
                config: { gain: 1 },
                context: mockContext,
                automation: mockAutomation,
                routerMasterGain: mockMasterGain,
                pluginFactory: mockPluginFactory
            });

            mockAutomation.ramp.mockClear();

            bus.setLogicalGain(0.2, 50);
            bus.setLogicalGain(0.8, 200);
            bus.setLogicalGain(0.4, 10);

            bus.processFrame(mockContext.currentTime);

            expect(mockAutomation.ramp).toHaveBeenCalledWith(bus.inputNode.gain, 0.4, 200, 'linear');
        });

        it('should correctly multiply logical gain with existing RTPC modifier', () => {
            const bus = new AudioBus({
                id: 'bus' as BusId,
                config: { gain: 1 },
                context: mockContext,
                automation: mockAutomation,
                routerMasterGain: mockMasterGain,
                pluginFactory: mockPluginFactory
            });

            bus.setRtpcGainModifier(0.5, 0);
            bus.processFrame(mockContext.currentTime);
            mockAutomation.ramp.mockClear();

            bus.setLogicalGain(0.8, 50);
            bus.processFrame(mockContext.currentTime);

            expect(mockAutomation.ramp).toHaveBeenCalledWith(bus.inputNode.gain, 0.4, 50, 'linear');
        });
    });

    describe('updateFilterParams()', () => {
        let bus: AudioBus;

        beforeEach(() => {
            bus = new AudioBus({
                id: 'bus' as BusId,
                config: {},
                context: mockContext,
                automation: mockAutomation,
                routerMasterGain: mockMasterGain,
                pluginFactory: mockPluginFactory
            });
            mockAutomation.ramp.mockClear();
        });

        it('should return early if filterNode or config is missing', () => {
            (bus as any).filterNode = null;
            bus.updateFilterParams({ type: 'lowpass', frequency: 500 });

            (bus as any).filterNode = {};
            bus.updateFilterParams(null);

            expect(mockAutomation.ramp).not.toHaveBeenCalled();
        });

        it('should return early if filter is not a Biquad (e.g., Convolver without frequency)', () => {
            (bus as any).filterNode = { type: 'reverb' };
            bus.updateFilterParams({ type: 'reverb' });
            expect(mockAutomation.ramp).not.toHaveBeenCalled();
        });

        it('should ramp frequency and Q if they are provided in config', () => {
            (bus as any).filterNode = {
                type: 'lowpass',
                frequency: { value: 0 },
                Q: { value: 0 }
            };

            bus.updateFilterParams({ type: 'lowpass', frequency: 800, Q: 2 });
            bus.processFrame(mockContext.currentTime);

            expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).filterNode.frequency, 800, 30, 'exponential');
            expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).filterNode.Q, 2, 30, 'linear');
        });
    });

    describe('safeReplaceFilter() edge cases', () => {
        it('should overwrite pending filter swap if called multiple times before execution', () => {
            const bus = new AudioBus({
                id: 'bus' as BusId,
                config: {},
                context: mockContext,
                automation: mockAutomation,
                routerMasterGain: mockMasterGain,
                pluginFactory: mockPluginFactory
            });

            bus.safeReplaceFilter({ type: 'lowpass', frequency: 500 }, 10);
            bus.safeReplaceFilter({ type: 'highpass', frequency: 500 }, 10);

            mockContext.currentTime += 0.015;
            bus.processFrame(mockContext.currentTime);

            expect(bus.getConfig().filter?.type).toBe('highpass');
        });
    });

    it('should bypass filter and connect pre to post if filter creation fails', () => {
        mockPluginFactory.getFiltersPlugin().createNode.mockReturnValueOnce(null);

        const bus = new AudioBus({
            id: 'bus' as BusId,
            config: {},
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockMasterGain,
            pluginFactory: mockPluginFactory
        });

        const connectSpy = vi.spyOn(bus.duckerTapNode, 'connect');

        bus.safeReplaceFilter({ type: 'alien_filter' as any }, 0);

        mockContext.currentTime += 0.01;
        bus.processFrame(mockContext.currentTime);

        expect(connectSpy).toHaveBeenCalledWith(expect.any(Object));
        expect(bus.getConfig().filter).toBeUndefined();
    });

    it('should correctly identify Reverb (non-Biquad) nodes and update config', () => {
        const mockConvolver = { connect: vi.fn(), disconnect: vi.fn() };
        mockPluginFactory.getFiltersPlugin().createNode.mockReturnValueOnce(mockConvolver);

        const bus = new AudioBus({
            id: 'bus' as BusId,
            config: {},
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockMasterGain,
            pluginFactory: mockPluginFactory
        });

        bus.safeReplaceFilter(mockConvolver as any, 0);

        mockContext.currentTime += 0.01;
        bus.processFrame(mockContext.currentTime);

        expect(bus.getConfig().filter).toEqual({ type: 'reverb' });
    });

    it('should pull RTPC for gain and automate inputGainNode when gameParam changes', () => {
        const bus = new AudioBus({
            id: 'sfx_bus' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockMasterGain,
            pluginFactory: mockPluginFactory
        });

        mockAutomation.ramp.mockClear();

        mockRtpcManager.getValue.mockReturnValue(100);

        bus.bindRTPC({
            gain: {
                gameParam: 'master_volume_slider' as GameParamId,
                curve: [
                    { x: 0, y: 0 },
                    { x: 100, y: 0.5 }
                ],
                smoothingMs: 120
            }
        });

        bus.tickRTPC(mockRtpcManager);
        bus.processFrame(mockContext.currentTime);

        expect(mockRtpcManager.getValue).toHaveBeenCalledWith('master_volume_slider');
        expect(mockAutomation.ramp).toHaveBeenCalledWith(bus.inputNode.gain, 0.5, 120, 'linear');
        expect((bus as any).targetParams.gain.rtpc).toBe(0.5);
    });
});

describe('AudioBus (Internal Branch Coverage & Edge Cases)', () => {
    let mockContext: any;
    let mockAutomation: any;
    let mockPluginFactory: any;
    let mockFiltersPlugin: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = createMockContext();
        mockAutomation = { ramp: vi.fn(), set: vi.fn() };

        mockFiltersPlugin = {
            createNode: vi.fn().mockReturnValue({ connect: vi.fn(), disconnect: vi.fn() }),
            dispose: vi.fn()
        };

        mockPluginFactory = {
            getFiltersPlugin: vi.fn().mockReturnValue(mockFiltersPlugin)
        };
    });

    it('should expose analyzerTapNode for metering/debugging', () => {
        const bus = new AudioBus({
            id: 'sfx' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockContext.createGain(),
            pluginFactory: mockPluginFactory
        });

        expect(bus.analyzerTapNode).toBeDefined();
    });

    it('should safely ignore tickRTPC if configs are absent or empty', () => {
        const bus = new AudioBus({
            id: 'sfx' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockContext.createGain(),
            pluginFactory: mockPluginFactory
        });

        const mockAdapter = { getValue: vi.fn().mockReturnValue(1) } as any;

        expect(() => {
            bus.tickRTPC(mockAdapter);
        }).not.toThrow();

        bus.bindRTPC({ gain: undefined } as any);
        expect(() => {
            bus.tickRTPC(mockAdapter);
        }).not.toThrow();
    });

    it('should handle reverb specific branching and catch createFilter errors', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        // oxlint-disable-next-line no-unused-vars
        const reverbBus = new AudioBus({
            id: 'sfx_reverb' as BusId,
            config: { gain: 1, filter: { type: 'reverb' as any, reverbTime: 2 } },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockContext.createGain(),
            pluginFactory: mockPluginFactory
        });

        expect(mockFiltersPlugin.createNode).toHaveBeenCalledWith(
            mockContext,
            mockAutomation,
            expect.objectContaining({ type: 'reverb' })
        );

        mockFiltersPlugin.createNode.mockImplementationOnce(() => {
            throw new Error('Filter Creation Crash');
        });

        // oxlint-disable-next-line no-unused-vars
        const errorBus = new AudioBus({
            id: 'sfx_error' as BusId,
            config: { gain: 1, filter: { type: 'lowpass', frequency: 1000 } },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockContext.createGain(),
            pluginFactory: mockPluginFactory
        });

        const hasLogged = warnSpy.mock.calls.length > 0 || errorSpy.mock.calls.length > 0;
        expect(hasLogged).toBe(true);

        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('should safely ignore unsupported RTPC targets like pitch on a bus', () => {
        const bus = new AudioBus({
            id: 'sfx' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockContext.createGain(),
            pluginFactory: mockPluginFactory
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        bus.bindRTPC({
            pitch: { gameParam: 'speed', curve: [] },
            magic_unknown: { gameParam: 'speed', curve: [] }
        } as any);

        const mockAdapter = { getValue: vi.fn().mockReturnValue(1) } as any;

        expect(() => {
            bus.tickRTPC(mockAdapter);
        }).not.toThrow();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unhandled RTPC target: magic_unknown'));

        warnSpy.mockRestore();
    });

    it('should handle missing filterNode and catch topology connection errors', () => {
        mockContext.currentTime = 0;

        const bus = new AudioBus({
            id: 'sfx' as BusId,
            config: { gain: 1 },
            context: mockContext,
            automation: mockAutomation,
            routerMasterGain: mockContext.createGain(),
            pluginFactory: mockPluginFactory
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockFiltersPlugin.createNode.mockReturnValue({
            connect: vi.fn(() => {
                throw new Error('Connect Exception');
            }),
            disconnect: vi.fn()
        });

        bus.safeReplaceFilter({ type: 'highpass', frequency: 1000 }, 0);

        bus.processFrame(10);

        expect(warnSpy).toHaveBeenCalledWith('[AudioBus] Failed to connect filterNode', expect.any(Error));

        bus.safeReplaceFilter(null, 0);
        expect(() => {
            bus.processFrame(20);
        }).not.toThrow();

        warnSpy.mockRestore();
    });
});

describe('AudioBus - HMR & Race Conditions (recalculateAndApply)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should cancel delayed disconnect if send is re-added before timeout (HMR Race Condition)', () => {
        const bus = new AudioBus({
            id: 'sfx' as any,
            config: { gain: 1 },
            context: createMockContext(),
            automation: { set: vi.fn(), ramp: vi.fn() } as any,
            routerMasterGain: null,
            pluginFactory: {} as any
        });

        const mockTargetNode = { disconnect: vi.fn(), connect: vi.fn() };

        bus.updateSend({ targetBusId: 'verb' as any, targetNode: mockTargetNode as any, targetGain: 1, durationMs: 0 });
        bus.processFrame(0);

        const sendNode = (bus as any).sendGains.get('verb');
        const disconnectSpy = vi.spyOn(sendNode, 'disconnect');

        bus.updateSend({
            targetBusId: 'verb' as any,
            targetNode: mockTargetNode as any,
            targetGain: null,
            durationMs: 100
        });
        bus.processFrame(1);

        vi.advanceTimersByTime(50);
        bus.updateSend({ targetBusId: 'verb' as any, targetNode: mockTargetNode as any, targetGain: 1, durationMs: 0 });

        vi.advanceTimersByTime(200);

        expect(disconnectSpy).not.toHaveBeenCalled();
        expect((bus as any).targetParams.sends.get('verb').logical).toBe(1);
    });

    it('should silently clean up send state if physical node never existed', () => {
        const bus = new AudioBus({
            id: 'sfx' as any,
            config: { gain: 1 },
            context: createMockContext(),
            automation: { set: vi.fn(), ramp: vi.fn() } as any,
            routerMasterGain: null,
            pluginFactory: {} as any
        });

        (bus as any).targetParams.sends.set('ghost', { logical: null, durationMs: 0 });

        (bus as any).isDirty = true;

        bus.processFrame(0);

        expect((bus as any).targetParams.sends.has('ghost')).toBe(false);
    });
});
