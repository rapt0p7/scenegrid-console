import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import AudioBus from '../AudioBus.js';

import type { AudioCtx, AutomationEngine, GainNodeLike, IPluginFactory } from '@webaudio-core';

describe('AudioBus (Filters, Sends, RTPC)', () => {
    let mockContext: any;
    let mockAutomation: any;
    let mockPluginFactory: any;
    let mockMasterGain: any;
    let mockRtpcManager: any;

    beforeEach(() => {
        vi.useFakeTimers();

        mockContext = {
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
            events: { on: vi.fn(), off: vi.fn() },
            getValue: vi.fn().mockReturnValue(0)
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should safely replace filter (fade out -> rebuild -> fade in)', async () => {
        const bus = new AudioBus({
            id: 'sfx_bus',
            config: { gain: 1 },
            context: mockContext as AudioCtx,
            automation: mockAutomation as AutomationEngine,
            routerMasterGain: mockMasterGain as GainNodeLike,
            pluginFactory: mockPluginFactory as IPluginFactory
        });

        const replacePromise = bus.safeReplaceFilter({ type: 'highpass', frequency: 500 }, 10);

        expect(mockAutomation.ramp).toHaveBeenCalledWith(bus.postFilterGain.gain, 0, 10, 'linear');

        await vi.advanceTimersByTimeAsync(12);
        await replacePromise;

        expect(mockPluginFactory.getFiltersPlugin().createNode).toHaveBeenCalled();
        expect(mockAutomation.ramp).toHaveBeenCalledWith(bus.postFilterGain.gain, 1, 10, 'linear');
        expect(bus.getConfig().filter).toBeDefined();
    });

    it('should correctly disconnect and remove filter when null is passed', async () => {
        const bus = new AudioBus({
            id: 'sfx_bus',
            config: { gain: 1 },
            context: mockContext as any,
            automation: mockAutomation as any,
            routerMasterGain: mockMasterGain as any,
            pluginFactory: mockPluginFactory as any
        });

        const addPromise = bus.safeReplaceFilter({ type: 'lowpass', frequency: 500 }, 5);
        await vi.advanceTimersByTimeAsync(10);
        await addPromise;

        expect(bus.getConfig().filter).toBeDefined();

        const removePromise = bus.safeReplaceFilter(null, 5);
        await vi.advanceTimersByTimeAsync(10);
        await removePromise;

        expect(bus.getConfig().filter).toBeUndefined();
    });

    it('should fade out and disconnect send when targetGain is null', async () => {
        const bus = new AudioBus({
            id: 'sfx_bus',
            config: { gain: 1 },
            context: mockContext as any,
            automation: mockAutomation as any,
            routerMasterGain: mockMasterGain as any,
            pluginFactory: mockPluginFactory as any
        });

        const mockTargetNode = { connect: vi.fn(), disconnect: vi.fn() } as any;

        bus.updateSend({ targetBusId: 'reverb_bus', targetNode: mockTargetNode, targetGain: 0.5, durationMs: 0 });
        await Promise.resolve();

        bus.updateSend({ targetBusId: 'reverb_bus', targetNode: mockTargetNode, targetGain: null, durationMs: 100 });
        await Promise.resolve();

        expect(mockAutomation.ramp).toHaveBeenCalledWith(expect.any(Object), 0, 100, 'linear');

        vi.advanceTimersByTime(160);

        const sendGainsMap = (bus as any).sendGains as Map<string, any>;
        expect(sendGainsMap.has('reverb_bus')).toBe(false);
    });

    it('should bind RTPC for filterFrequency and pan and calculate additive math correctly', async () => {
        const bus = new AudioBus({
            id: 'sfx_bus',
            config: { gain: 1 },
            context: mockContext as any,
            automation: mockAutomation as any,
            routerMasterGain: mockMasterGain as any,
            pluginFactory: mockPluginFactory as any
        });

        (bus as any).filterNode = { frequency: { value: 1000 } };
        (bus as any).pannerNode = { pan: { value: 0 } };

        mockAutomation.ramp.mockClear();

        (bus as any).targetParams.filterFrequency.logical = 1000;
        (bus as any).targetParams.pan.logical = 0;

        mockRtpcManager.getValue.mockReturnValue(100);

        bus.bindRTPC(
            {
                filterFrequency: {
                    gameParam: 'speed',
                    curve: [
                        { x: 0, y: 0 },
                        { x: 100, y: 500 }
                    ]
                },
                pan: {
                    gameParam: 'position',
                    curve: [
                        { x: -1, y: -1 },
                        { x: 100, y: 0.5 }
                    ]
                }
            },
            mockRtpcManager
        );

        await Promise.resolve();

        expect(mockRtpcManager.events.on).toHaveBeenCalledTimes(2);

        expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).filterNode.frequency, 1500, 50, 'exponential');

        expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).pannerNode.pan, 0.5, 50, 'linear');
    });

    it('should bind RTPC to sendLevel and automate send gain when gameParam changes', async () => {
        const bus = new AudioBus({
            id: 'sfx_bus',
            config: { gain: 1 },
            context: mockContext as any,
            automation: mockAutomation as any,
            routerMasterGain: mockMasterGain as any,
            pluginFactory: mockPluginFactory as any
        });

        const mockTargetNode = { connect: vi.fn(), disconnect: vi.fn() } as any;

        bus.updateSend({ targetBusId: 'reverb_bus', targetNode: mockTargetNode, targetGain: 1, durationMs: 0 });
        await Promise.resolve();

        mockAutomation.ramp.mockClear();
        mockRtpcManager.getValue.mockReturnValue(100);

        bus.bindRTPC(
            {
                sendLevel: {
                    sendTargetBus: 'reverb_bus',
                    gameParam: 'cave_depth',
                    curve: [
                        { x: 0, y: 0 },
                        { x: 100, y: 0.8 }
                    ],
                    smoothingMs: 200
                }
            },
            mockRtpcManager
        );

        await Promise.resolve();

        const sendGainsMap = (bus as any).sendGains as Map<string, any>;
        const reverbSendGainNode = sendGainsMap.get('reverb_bus');

        expect(mockAutomation.ramp).toHaveBeenCalledWith(reverbSendGainNode.gain, 0.8, 200, 'linear');
    });

    it('should safely ignore missing sendTargetBus and safely cache RTPC modifiers for uninitialized sends', async () => {
        const bus = new AudioBus({
            id: 'sfx_bus',
            config: { gain: 1 },
            context: mockContext as any,
            automation: mockAutomation as any,
            routerMasterGain: mockMasterGain as any,
            pluginFactory: mockPluginFactory as any
        });

        mockRtpcManager.getValue.mockReturnValue(100);

        expect(() => {
            bus.bindRTPC(
                {
                    sendLevel: {
                        gameParam: 'depth',
                        curve: [{ x: 100, y: 0.5 }]
                    }
                },
                mockRtpcManager
            );
        }).not.toThrow();

        bus.bindRTPC(
            {
                sendLevel: {
                    sendTargetBus: 'ghost_bus',
                    gameParam: 'depth',
                    curve: [{ x: 100, y: 0.5 }]
                }
            },
            mockRtpcManager
        );

        await Promise.resolve();

        const ghostBusState = (bus as any).targetParams.sends.get('ghost_bus');
        expect(ghostBusState).toBeDefined();
        expect(ghostBusState.logical).toBe(0);
        expect(ghostBusState.rtpc).toBe(0.5);
    });

    it('should bind RTPC using preset curves and calculate math correctly', async () => {
        const bus = new AudioBus({
            id: 'sfx_bus',
            config: { gain: 1 },
            context: mockContext as any,
            automation: mockAutomation as any,
            routerMasterGain: mockMasterGain as any,
            pluginFactory: mockPluginFactory as any
        });

        (bus as any).filterNode = { frequency: { value: 1000 } };
        mockAutomation.ramp.mockClear();

        (bus as any).targetParams.filterFrequency.logical = 1000;

        mockRtpcManager.getValue.mockReturnValue(50);

        bus.bindRTPC(
            {
                filterFrequency: {
                    gameParam: 'speed',
                    curve: {
                        type: 's-curve',
                        minX: 0,
                        maxX: 100,
                        minY: 0,
                        maxY: 2000
                    }
                }
            },
            mockRtpcManager
        );

        await Promise.resolve();

        expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).filterNode.frequency, 2000, 50, 'exponential');
    });

    describe('coldStart() initialization logic', () => {
        it('should connect pre to post directly if no filter is configured', () => {
            const bus = new AudioBus({
                id: 'bus',
                config: { gain: 1 },
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            expect(bus.preFilterGain.connect).toHaveBeenCalledWith(bus.postFilterGain);
            expect((bus as any).filterNode).toBeNull();
        });

        it('should create and connect a Biquad filter if configured, and cache its parameters', () => {
            const bus = new AudioBus({
                id: 'bus',
                config: { gain: 1, filter: { type: 'lowpass', frequency: 22_000 } },
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            const filterNode = (bus as any).filterNode;
            expect(filterNode).toBeDefined();

            expect(bus.preFilterGain.connect).toHaveBeenCalledWith(filterNode);
            expect(filterNode.connect).toHaveBeenCalledWith(bus.postFilterGain);

            expect(bus.getConfig().filter).toEqual({
                type: 'lowpass',
                frequency: 22_000,
                Q: 1
            });
        });

        it('should create and connect a non-Biquad filter (e.g. reverb) without caching biquad params', () => {
            const mockConvolver = { connect: vi.fn(), disconnect: vi.fn() };
            mockPluginFactory.getFiltersPlugin().createNode.mockReturnValueOnce(mockConvolver);

            const bus = new AudioBus({
                id: 'bus',
                config: { gain: 1, filter: { type: 'reverb' } },
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            expect((bus as any).filterNode).toBe(mockConvolver);
            expect(bus.preFilterGain.connect).toHaveBeenCalledWith(mockConvolver);

            expect(bus.getConfig().filter).toEqual({ type: 'reverb' });
        });

        it('should fallback to direct connection and delete config.filter if filter creation fails', () => {
            mockPluginFactory.getFiltersPlugin().createNode.mockReturnValueOnce(null);

            const bus = new AudioBus({
                id: 'bus',
                config: { gain: 1, filter: { type: 'lowpass', frequency: 22_000 } },
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            expect((bus as any).filterNode).toBeNull();
            expect(bus.preFilterGain.connect).toHaveBeenCalledWith(bus.postFilterGain);
            expect(bus.getConfig().filter).toBeUndefined();
        });
    });

    describe('setLogicalGain() logic', () => {
        it('should update logical gain, trigger microtask, and automate inputGainNode', async () => {
            const bus = new AudioBus({
                id: 'bus',
                config: { gain: 1 },
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            mockAutomation.ramp.mockClear();

            bus.setLogicalGain(0.5, 100);

            expect((bus as any).targetParams.gain.logical).toBe(0.5);

            await Promise.resolve();

            expect(mockAutomation.ramp).toHaveBeenCalledWith(bus.inputGainNode.gain, 0.5, 100, 'linear');

            expect((bus as any).targetParams.gain.durationMs).toBe(0);
        });

        it('should use Math.max for durationMs when called multiple times before flush', async () => {
            const bus = new AudioBus({
                id: 'bus',
                config: { gain: 1 },
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            mockAutomation.ramp.mockClear();

            bus.setLogicalGain(0.2, 50);
            bus.setLogicalGain(0.8, 200);
            bus.setLogicalGain(0.4, 10);

            await Promise.resolve();

            expect(mockAutomation.ramp).toHaveBeenCalledWith(bus.inputGainNode.gain, 0.4, 200, 'linear');
        });

        it('should correctly multiply logical gain with existing RTPC modifier', async () => {
            const bus = new AudioBus({
                id: 'bus',
                config: { gain: 1 },
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            bus.setRtpcGainModifier(0.5, 0);
            await Promise.resolve();
            mockAutomation.ramp.mockClear();

            bus.setLogicalGain(0.8, 50);
            await Promise.resolve();

            expect(mockAutomation.ramp).toHaveBeenCalledWith(bus.inputGainNode.gain, 0.4, 50, 'linear');
        });
    });

    describe('updateFilterParams()', () => {
        let bus: AudioBus;

        beforeEach(() => {
            bus = new AudioBus({
                id: 'bus',
                config: {},
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
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

        it('should return early if config type is explicitly "reverb"', () => {
            (bus as any).filterNode = { frequency: {} };
            bus.updateFilterParams({ type: 'reverb' });
            expect(mockAutomation.ramp).not.toHaveBeenCalled();
        });

        it('should ramp frequency and Q if they are provided in config', async () => {
            (bus as any).filterNode = {
                type: 'lowpass',
                frequency: { value: 0 },
                Q: { value: 0 }
            };

            bus.updateFilterParams({ type: 'lowpass', frequency: 800, Q: 2 });

            await Promise.resolve();

            expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).filterNode.frequency, 800, 30, 'exponential');
            expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).filterNode.Q, 2, 30, 'linear');
        });
    });

    describe('safeReplaceFilter() edge cases', () => {
        it('should lock concurrent calls with while (this.filterReplacePromise)', async () => {
            const bus = new AudioBus({
                id: 'bus',
                config: {},
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            const p1 = bus.safeReplaceFilter({ type: 'lowpass', frequency: 500 }, 10);
            const p2 = bus.safeReplaceFilter({ type: 'highpass', frequency: 500 }, 10);

            await vi.advanceTimersByTimeAsync(100);
            await Promise.all([p1, p2]);

            expect(bus.getConfig().filter?.type).toBe('highpass');
        });

        it('should bypass filter and connect pre to post if filter creation fails', async () => {
            mockPluginFactory.getFiltersPlugin().createNode.mockReturnValueOnce(null);

            const bus = new AudioBus({
                id: 'bus',
                config: {},
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            const preConnectSpy = vi.spyOn(bus.preFilterGain, 'connect');

            const p = bus.safeReplaceFilter({ type: 'alien_filter' } as any, 0);
            await vi.advanceTimersByTimeAsync(50);
            await p;

            expect(preConnectSpy).toHaveBeenCalledWith(bus.postFilterGain);
        });

        it('should correctly identify Reverb (non-Biquad) nodes and update config', async () => {
            const mockConvolver = { connect: vi.fn(), disconnect: vi.fn() };
            mockPluginFactory.getFiltersPlugin().createNode.mockReturnValueOnce(mockConvolver);

            const bus = new AudioBus({
                id: 'bus',
                config: {},
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            const p = bus.safeReplaceFilter(mockConvolver as any, 0);
            await vi.advanceTimersByTimeAsync(50);
            await p;

            expect(bus.getConfig().filter).toEqual({ type: 'reverb' });
        });
    });

    it('should bind RTPC to gain and automate inputGainNode when gameParam changes', async () => {
        const bus = new AudioBus({
            id: 'sfx_bus',
            config: { gain: 1 },
            context: mockContext as any,
            automation: mockAutomation as any,
            routerMasterGain: mockMasterGain as any,
            pluginFactory: mockPluginFactory as any
        });

        mockAutomation.ramp.mockClear();

        mockRtpcManager.getValue.mockReturnValue(100);

        bus.bindRTPC(
            {
                gain: {
                    gameParam: 'master_volume_slider',
                    curve: [
                        { x: 0, y: 0 },
                        { x: 100, y: 0.5 }
                    ],
                    smoothingMs: 120
                }
            },
            mockRtpcManager
        );

        await Promise.resolve();

        expect(mockRtpcManager.events.on).toHaveBeenCalledWith('master_volume_slider', expect.any(Function));

        expect(mockAutomation.ramp).toHaveBeenCalledWith(bus.inputGainNode.gain, 0.5, 120, 'linear');

        expect((bus as any).targetParams.gain.rtpc).toBe(0.5);
    });
});
