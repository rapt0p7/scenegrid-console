import { describe, it, expect, vi, beforeEach } from 'vitest';

import AudioBusSystem from '../AudioBusSystem.js';

import type { IBuses } from '../../../interfaces/IBuses.js';
import type { ISoundInstance, IPluginFactory } from '@infrastructure';

vi.mock('../../helpers/nodes', () => ({
    safeDisconnect: vi.fn(node => {
        if (node.shouldThrow) throw new Error('Disconnect Error');
    })
}));

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

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe('AudioBusSystem (Routing, Fallbacks & Edge Cases)', () => {
    let mockContext: any;
    let mockAutomation: any;
    let mockMasterOutput: any;
    let mockBusConfig: IBuses;
    let mockPluginFactory: IPluginFactory;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = createMockContext();
        mockAutomation = { ramp: vi.fn(), set: vi.fn() };
        mockMasterOutput = { input: {} };

        mockBusConfig = {
            music: { gain: 1 },
            sfx: { gain: 0.8, sends: { music: 0.5 } }
        };

        mockPluginFactory = {
            createLimiter: vi.fn().mockReturnValue({
                inputNode: { isCustomLimiter: true, connect: vi.fn() },
                outputNode: { connect: vi.fn() },
                load: vi.fn().mockResolvedValue(undefined),
                dispose: vi.fn()
            }),
            createSidechain: vi.fn().mockReturnValue({
                insertLookahead: vi.fn(),
                start: vi.fn().mockResolvedValue(undefined),
                activeEnvelope: 0.5
            }),
            getFiltersPlugin: vi.fn().mockReturnValue({
                inputNode: { connect: vi.fn() },
                outputNode: { connect: vi.fn() },
                dispose: vi.fn()
            })
        };
    });

    it('should initialize buses and apply sends from config', () => {
        const busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });

        expect(busSystem.getBus('music')).toBeDefined();
        expect(busSystem.getBus('sfx')).toBeDefined();
        expect(mockContext.createGain).toHaveBeenCalled();
    });

    it('should auto-initialize sidechains if defined in bus config', async () => {
        const configWithSidechain = {
            ...mockBusConfig,
            sfx: { gain: 0.8, sidechain: { enabled: true } }
        };

        const busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: configWithSidechain,
            pluginFactory: mockPluginFactory
        });

        await flushPromises();

        expect(mockPluginFactory.createSidechain).toHaveBeenCalled();
        expect(busSystem.getSidechain('sfx')).toBeDefined();
    });

    it('should successfully load CUSTOM limiter from PluginFactory', async () => {
        const busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });

        await flushPromises();

        expect(mockPluginFactory.createLimiter).toHaveBeenCalledTimes(1);
        expect(mockContext.createDynamicsCompressor).not.toHaveBeenCalled();
    });

    it('should fallback to NATIVE compressor if custom limiter throws during load', async () => {
        mockPluginFactory.createLimiter = vi.fn().mockReturnValue({
            inputNode: {},
            outputNode: {},
            dispose: vi.fn(),
            load: vi.fn().mockRejectedValue(new Error('Worklet crashed!'))
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });

        await flushPromises();

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Custom limiter failed'), expect.any(Error));
        expect(mockContext.createDynamicsCompressor).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });

    it('should correctly route a SoundInstance to a requested bus', () => {
        const busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });

        const mockNode = { connect: vi.fn(), disconnect: vi.fn() };
        const mockInstance = { outputNode: mockNode } as unknown as ISoundInstance;

        busSystem.routeInstance(mockInstance, 'music');
        expect(mockNode.connect).toHaveBeenCalled();

        mockNode.connect.mockClear();

        busSystem.routeInstance(mockInstance, 'fake_bus' as any);
        expect(mockNode.connect).not.toHaveBeenCalled();
    });

    it('should route without limiter if isUseLimiter is false', () => {
        const system = new AudioBusSystem(
            {
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: mockBusConfig,
                pluginFactory: mockPluginFactory
            },
            { isUseLimiter: false }
        );
        expect(system['routerMasterGain'].connect).toHaveBeenCalledWith(system['postLimiterGain']);
        expect(mockPluginFactory.createLimiter).not.toHaveBeenCalled();
    });

    it('should catch critical errors during limiter initialization and log error (constructor catch)', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockPluginFactory.createLimiter = vi.fn().mockImplementation(() => {
            throw new Error('Limiter Crash');
        });
        mockContext.createDynamicsCompressor.mockImplementation(() => {
            throw new Error('Fallback Crash');
        });

        new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });
        await flushPromises();

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[AudioBusSystem] Critical failure during limiter initialization',
            expect.any(Error)
        );

        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('should safely execute fallback limiter dispose method even if it throws', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockPluginFactory.createLimiter = vi.fn().mockImplementation(() => {
            throw new Error('Limiter Crash');
        });

        const system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });
        await flushPromises();

        const limiter = system['masterLimiter'] as any;

        limiter.inputNode.disconnect.mockImplementationOnce(() => {
            throw new Error('Disconnect failed');
        });
        expect(() => limiter.dispose()).not.toThrow();

        consoleWarnSpy.mockRestore();
    });

    it('should handle routing edge cases (suspended context, no outputNode, connect error)', () => {
        const system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });

        const mockNode = { connect: vi.fn(), disconnect: vi.fn() };
        const mockInstance = { outputNode: mockNode } as any;

        mockContext.state = 'suspended';
        system.routeInstance(mockInstance, 'sfx');
        expect(mockNode.connect).not.toHaveBeenCalled();
        mockContext.state = 'running';

        mockNode.connect.mockClear();

        mockNode.connect.mockImplementationOnce(() => {
            throw new Error('Connect Error');
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        system.routeInstance(mockInstance, 'sfx');

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();

        expect(() => {
            system.routeInstance({} as any, 'sfx');
        }).not.toThrow();
    });

    it('should handle applySend edge cases (missing source/target, fade out)', () => {
        const system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        system.applySend('ghost_bus' as any, 'music', 1);
        expect(warnSpy).not.toHaveBeenCalled();

        system.applySend('sfx', 'ghost_bus' as any, 1);
        expect(warnSpy).toHaveBeenCalled();

        const sourceBus = system.getBus('sfx');
        const updateSendSpy = vi.spyOn(sourceBus as any, 'updateSend');
        system.applySend('sfx', 'ghost_bus' as any, null, 100);
        expect(updateSendSpy).toHaveBeenCalledWith({
            targetBusId: 'ghost_bus',
            targetNode: null,
            targetGain: null,
            durationMs: 100
        });

        warnSpy.mockRestore();
    });
});

describe('AudioBusSystem (Getters & Gain Calculations)', () => {
    let system: AudioBusSystem;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mockContext = createMockContext();

        const mockPluginFactory = {
            createLimiter: vi
                .fn()
                .mockReturnValue({ load: vi.fn(), inputNode: { connect: vi.fn() }, outputNode: { connect: vi.fn() } }),
            createSidechain: vi.fn().mockReturnValue({
                insertLookahead: vi.fn(),
                start: vi.fn().mockResolvedValue(undefined),
                activeEnvelope: 0.5
            })
        };

        system = new AudioBusSystem({
            context: mockContext,
            automation: { set: vi.fn(), ramp: vi.fn() } as any,
            masterOutput: { input: {} } as any,
            busConfig: {
                sfx: { gain: 1 },
                ducked: { gain: 1, sidechain: { enabled: true } }
            },
            pluginFactory: mockPluginFactory as any
        });

        await flushPromises();
    });

    it('should return buses map and master node', () => {
        const buses = system.getAllBuses();
        expect(buses.size).toBe(2);
        expect(system.getMasterNode()).toBeDefined();
    });

    it('should calculate current gain with and without sidechain', () => {
        expect(system.getCurrentRealGain('sfx')).toBe(1);
        expect(system.getCurrentRealGain('ghost' as any)).toBe(0);

        expect(system.getCurrentRealGain('ducked')).toBe(0.5);
    });

    it('should compute offline gain transition', () => {
        const normalTransition = system.computeOfflineGainTransition('sfx', 0.8);
        expect(normalTransition).toEqual({ from: 1, to: 0.8 });

        const scTransition = system.computeOfflineGainTransition('ducked', 0.8);
        expect(scTransition).toEqual({ from: 0.5, to: 0.4 });

        expect(system.computeOfflineGainTransition('ghost' as any, 1)).toEqual({ from: 0, to: 1 });
    });
});

describe('AudioBusSystem (createSidechain Edge Cases)', () => {
    let mockContext: any;
    let mockAutomation: any;
    let mockMasterOutput: any;
    let mockPluginFactory: any;
    let system: AudioBusSystem;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockContext = createMockContext();
        mockAutomation = { ramp: vi.fn(), set: vi.fn() };
        mockMasterOutput = { input: {} };

        mockPluginFactory = {
            createLimiter: vi.fn().mockReturnValue({
                load: vi.fn().mockResolvedValue(undefined),
                inputNode: { connect: vi.fn() },
                outputNode: { connect: vi.fn() },
                dispose: vi.fn()
            }),
            createSidechain: vi.fn().mockReturnValue({
                insertLookahead: vi.fn(),
                start: vi.fn().mockResolvedValue(undefined),
                activeEnvelope: 0.5,
                dispose: vi.fn()
            })
        };

        system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: { sfx: { gain: 1, sidechain: { enabled: true } } },
            pluginFactory: mockPluginFactory
        });

        await flushPromises();
    });

    it('should warn and early return if requested bus is not found', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await (system as any).createSidechain('invalid_bus');

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Bus 'invalid_bus' not found"));
        warnSpy.mockRestore();
    });

    it('should dispose old sidechain if one already exists for the bus', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const oldDucker = system.getSidechain('sfx');
        expect(oldDucker).toBeDefined();

        await (system as any).createSidechain('sfx');

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already exists. Disposing old instance'));
        expect(oldDucker?.dispose).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });

    it('should catch errors if ducker.start() fails and safely dispose the created instance', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const failingDucker = {
            insertLookahead: vi.fn(),
            start: vi.fn().mockRejectedValue(new Error('Worklet failed to load')),
            dispose: vi.fn()
        };
        mockPluginFactory.createSidechain.mockReturnValueOnce(failingDucker);

        (system as any).sidechains.delete('sfx');

        await (system as any).createSidechain('sfx');

        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining("Failed to start sidechain for bus 'sfx'"),
            expect.any(Error)
        );
        expect(failingDucker.dispose).toHaveBeenCalledTimes(1);

        errorSpy.mockRestore();
    });
});
