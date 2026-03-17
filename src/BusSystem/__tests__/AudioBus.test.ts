import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import AudioBus from '../AudioBus';

import type { IPluginFactory } from '../../interfaces/IAudioPlugins';
import type { AudioCtx, AutomationEngine, GainNodeLike } from '@webaudio-core';

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

        bus.updateSend('reverb_bus', mockTargetNode, 0.5, 0);

        bus.updateSend('reverb_bus', mockTargetNode, null, 100);

        expect(mockAutomation.ramp).toHaveBeenCalledWith(expect.any(Object), 0, 100, 'linear');

        vi.advanceTimersByTime(160);

        const sendGainsMap = (bus as any).sendGains as Map<string, any>;
        expect(sendGainsMap.has('reverb_bus')).toBe(false);
    });

    it('should bind RTPC for filterFrequency and pan', () => {
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

        bus.bindRTPC(
            {
                filterFrequency: {
                    gameParam: 'speed',
                    curve: [
                        { x: 0, y: 500 },
                        { x: 100, y: 5000 }
                    ]
                },
                pan: {
                    gameParam: 'position',
                    curve: [
                        { x: -1, y: -1 },
                        { x: 1, y: 1 }
                    ]
                }
            },
            mockRtpcManager
        );

        expect(mockRtpcManager.events.on).toHaveBeenCalledTimes(2);

        expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).filterNode.frequency, 500, 50, 'exponential');

        expect(mockAutomation.ramp).toHaveBeenCalledWith((bus as any).pannerNode.pan, 0, 50, 'linear');
    });

    it('should bind RTPC to sendLevel and automate send gain when gameParam changes', () => {
        const bus = new AudioBus({
            id: 'sfx_bus',
            config: { gain: 1 },
            context: mockContext as any,
            automation: mockAutomation as any,
            routerMasterGain: mockMasterGain as any,
            pluginFactory: mockPluginFactory as any
        });

        const mockTargetNode = { connect: vi.fn(), disconnect: vi.fn() } as any;

        bus.updateSend('reverb_bus', mockTargetNode, 0, 0);

        mockAutomation.ramp.mockClear();

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

        const sendGainsMap = (bus as any).sendGains as Map<string, any>;
        const reverbSendGainNode = sendGainsMap.get('reverb_bus');

        expect(mockAutomation.ramp).toHaveBeenCalledWith(reverbSendGainNode.gain, 0, 200, 'linear');
    });

    it('should warn and ignore RTPC sendLevel if sendTargetBus is missing or send is uninitialized', () => {
        const bus = new AudioBus({
            id: 'sfx_bus',
            config: { gain: 1 },
            context: mockContext as any,
            automation: mockAutomation as any,
            routerMasterGain: mockMasterGain as any,
            pluginFactory: mockPluginFactory as any
        });

        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        bus.bindRTPC(
            {
                sendLevel: {
                    gameParam: 'depth',
                    curve: [
                        { x: 0, y: 0 },
                        { x: 1, y: 1 }
                    ]
                }
            },
            mockRtpcManager
        );

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("requires a 'sendTargetBus' property"));

        bus.bindRTPC(
            {
                sendLevel: {
                    sendTargetBus: 'ghost_bus',
                    gameParam: 'depth',
                    curve: [
                        { x: 0, y: 0 },
                        { x: 1, y: 1 }
                    ]
                }
            },
            mockRtpcManager
        );

        expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Cannot bind RTPC to sendLevel for "ghost_bus"')
        );

        consoleSpy.mockRestore();
    });

    describe('update() logic', () => {
        it('should safely replace filter if filter node exists but type changed', async () => {
            const bus = new AudioBus({
                id: 'bus',
                config: {},
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            const replaceSpy = vi.spyOn(bus, 'safeReplaceFilter');

            const p1 = bus.update('bus', { filter: { type: 'lowpass', frequency: 500 } });
            await vi.advanceTimersByTimeAsync(50);
            await p1;

            expect(replaceSpy).toHaveBeenCalledTimes(1);
            replaceSpy.mockClear();

            (bus as any).filterNode = { type: 'lowpass', frequency: {} };

            const p2 = bus.update('bus', { filter: { type: 'reverb' } });
            await vi.advanceTimersByTimeAsync(50);
            await p2;

            expect(replaceSpy).toHaveBeenCalledTimes(1);
        });

        it('should call updateFilterParams if filter exists and type is the same', async () => {
            const bus = new AudioBus({
                id: 'bus',
                config: {},
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            (bus as any).filterNode = { type: 'lowpass', frequency: {} };
            const updateParametersSpy = vi.spyOn(bus, 'updateFilterParams').mockImplementation(() => {});

            const p = bus.update('bus', { filter: { type: 'lowpass', frequency: 1000 } });
            await vi.advanceTimersByTimeAsync(50);
            await p;

            expect(updateParametersSpy).toHaveBeenCalledTimes(1);
        });

        it('should remove filter safely if config no longer has a filter', async () => {
            const bus = new AudioBus({
                id: 'bus',
                config: {},
                context: mockContext as any,
                automation: mockAutomation as any,
                routerMasterGain: mockMasterGain as any,
                pluginFactory: mockPluginFactory as any
            });

            (bus as any).filterNode = { type: 'lowpass', frequency: {} };
            const replaceSpy = vi.spyOn(bus, 'safeReplaceFilter').mockResolvedValue();

            const p = bus.update('bus', { gain: 0.5 });
            await vi.advanceTimersByTimeAsync(50);
            await p;

            expect(replaceSpy).toHaveBeenCalledWith(null, 8);
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

        it('should ramp frequency and Q if they are provided in config', () => {
            (bus as any).filterNode = {
                type: 'lowpass',
                frequency: { value: 0 },
                Q: { value: 0 }
            };

            bus.updateFilterParams({ type: 'lowpass', frequency: 800, Q: 2 });

            expect(mockAutomation.ramp).toHaveBeenCalledTimes(2);
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
});
