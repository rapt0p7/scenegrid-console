// noinspection D

import { describe, it, expect, vi, beforeEach } from 'vitest';

import AudioBus from '@infrastructure/busSystem/AudioBus.js';
import AudioBusSystem from '@infrastructure/busSystem/AudioBusSystem.js';

import type { IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type { BusId } from '@domain/Types/Branded.js';
import type { IPluginFactory } from '@infrastructure';
import type { AudioNodeLike } from '@infrastructure/types/IAudioContext.js';

vi.mock('@infrastructure', () => ({
    safeDisconnect: vi.fn((node: any) => {
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

describe('AudioBusSystem (Routing, Fallbacks & Edge Cases)', () => {
    let mockContext: any;
    let mockAutomation: any;
    let mockMasterOutput: any;
    let mockBusConfig: IBuses;
    let mockPluginFactory: IPluginFactory;
    let mockTicker: any;
    let capturedTickCallback: ((time: number) => void) | null;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedTickCallback = null;

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
                activeEnvelope: 0.5,
                addSource: vi.fn(),
                removeSource: vi.fn(),
                removeAllSources: vi.fn(),
                dispose: vi.fn()
            }),
            getFiltersPlugin: vi.fn().mockReturnValue({
                inputNode: { connect: vi.fn() },
                outputNode: { connect: vi.fn() },
                dispose: vi.fn()
            })
        };

        mockTicker = {
            add: vi.fn().mockImplementation((id, rate, callback) => {
                capturedTickCallback = callback;
            }),
            remove: vi.fn()
        };
    });

    it('should initialize buses and apply sends from config', async () => {
        const busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });

        await busSystem.initialize(mockTicker);

        expect(busSystem.getBus('music' as BusId)).toBeDefined();
        expect(busSystem.getBus('sfx' as BusId)).toBeDefined();
        expect(mockContext.createGain).toHaveBeenCalled();
    });

    it('should register with EngineTicker and process frames on tick', async () => {
        const busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });

        await busSystem.initialize(mockTicker);

        expect(mockTicker.add).toHaveBeenCalledWith('audio-bus-system', 20, expect.any(Function));
        expect(capturedTickCallback).toBeDefined();

        const processFrameSpy = vi.spyOn(AudioBus.prototype, 'processFrame').mockImplementation(() => {});

        capturedTickCallback!(123.45);

        expect(processFrameSpy).toHaveBeenCalledTimes(2);
        expect(processFrameSpy).toHaveBeenCalledWith(123.45);

        processFrameSpy.mockRestore();
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

        await busSystem.initialize(mockTicker);

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

        await busSystem.initialize(mockTicker);

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

        const busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });

        await busSystem.initialize(mockTicker);

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Custom limiter failed'), expect.any(Error));
        expect(mockContext.createDynamicsCompressor).toHaveBeenCalledTimes(1);

        warnSpy.mockRestore();
    });

    it('should correctly route a physical AudioNode to a requested bus', async () => {
        const busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });
        await busSystem.initialize(mockTicker);

        const mockConnect = vi.fn();

        const mockNode = { connect: mockConnect, disconnect: vi.fn() } as unknown as AudioNodeLike;

        busSystem.connectNodeToBus(mockNode, 'music' as BusId);
        expect(mockNode.connect).toHaveBeenCalled();

        mockConnect.mockClear();

        busSystem.connectNodeToBus(mockNode, 'fake_bus' as any);
        expect(mockNode.connect).not.toHaveBeenCalled();
    });

    it('should handle routing edge cases (suspended context, connect error)', async () => {
        const system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });
        await system.initialize(mockTicker);
        const mockConnect = vi.fn();
        const mockNode = { connect: mockConnect, disconnect: vi.fn() } as unknown as AudioNodeLike;

        mockContext.state = 'suspended';
        system.connectNodeToBus(mockNode, 'sfx' as BusId);
        expect(mockNode.connect).not.toHaveBeenCalled();
        mockContext.state = 'running';

        mockConnect.mockClear();

        mockConnect.mockImplementationOnce(() => {
            throw new Error('Connect Error');
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        system.connectNodeToBus(mockNode, 'sfx' as BusId);

        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('should route without limiter if isUseLimiter is false', async () => {
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
        await system.initialize(mockTicker);

        expect(system['routerMasterGain'].connect).toHaveBeenCalledWith(system['postLimiterGain']);
        expect(mockPluginFactory.createLimiter).not.toHaveBeenCalled();
    });

    it('should catch critical errors during limiter initialization and log error', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockPluginFactory.createLimiter = vi.fn().mockImplementation(() => {
            throw new Error('Limiter Crash');
        });
        mockContext.createDynamicsCompressor.mockImplementation(() => {
            throw new Error('Fallback Crash');
        });

        const busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });

        await busSystem.initialize(mockTicker);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            '[AudioBusSystem] Critical failure during limiter initialization',
            expect.any(Error)
        );

        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('should handle applySend edge cases (missing source/target, fade out)', async () => {
        const system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });
        await system.initialize(mockTicker);

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        system.applySend('ghost_bus' as any, 'music' as BusId, 1);
        expect(warnSpy).not.toHaveBeenCalled();

        system.applySend('sfx' as BusId, 'ghost_bus' as any, 1);
        expect(warnSpy).toHaveBeenCalled();

        const sourceBus = system.getBus('sfx' as BusId);
        const updateSendSpy = vi.spyOn(sourceBus as any, 'updateSend');
        system.applySend('sfx' as BusId, 'ghost_bus' as any, null, 100);

        expect(updateSendSpy).toHaveBeenCalledWith({
            targetBusId: 'ghost_bus',
            targetNode: null,
            targetGain: null,
            durationMs: 100
        });

        warnSpy.mockRestore();
    });
});

describe('AudioBusSystem (Sidechain Triggers via AudioNode)', () => {
    let mockSidechain: any;
    let system: AudioBusSystem;
    let mockTicker: any;

    beforeEach(async () => {
        mockSidechain = {
            insertLookahead: vi.fn(),
            start: vi.fn().mockResolvedValue(undefined),
            addSource: vi.fn(),
            removeSource: vi.fn(),
            removeAllSources: vi.fn(),
            activeEnvelope: 0.5,
            dispose: vi.fn()
        };

        const mockPluginFactory = {
            createLimiter: vi
                .fn()
                .mockReturnValue({ load: vi.fn(), inputNode: { connect: vi.fn() }, outputNode: { connect: vi.fn() } }),
            createSidechain: vi.fn().mockReturnValue(mockSidechain)
        };

        mockTicker = { add: vi.fn(), remove: vi.fn() };

        system = new AudioBusSystem({
            context: createMockContext(),
            automation: { set: vi.fn(), ramp: vi.fn() } as any,
            masterOutput: { input: {} } as any,
            busConfig: { ducked: { gain: 1, sidechain: { enabled: true } } },
            pluginFactory: mockPluginFactory as any
        });

        await system.initialize(mockTicker);
    });

    it('should add sidechain source directly using physical node', () => {
        const mockGainNode = {} as AudioNodeLike;

        system.addSidechainSource(mockGainNode, 'ducked' as BusId, 0.8);
        expect(mockSidechain.addSource).toHaveBeenCalledWith(mockGainNode, 0.8);
    });

    it('should remove sidechain source directly', () => {
        const mockGainNode = {} as AudioNodeLike;

        system.removeSidechainSource(mockGainNode, 'ducked' as BusId);
        expect(mockSidechain.removeSource).toHaveBeenCalledWith(mockGainNode);
    });

    it('should clear all sidechain sources', () => {
        system.clearAllSidechainTriggers();
        expect(mockSidechain.removeAllSources).toHaveBeenCalledTimes(1);
    });

    it('should safely ignore triggers for non-existent buses', () => {
        expect(() => {
            const mockGainNode = {} as AudioNodeLike;
            system.addSidechainSource(mockGainNode, 'ghost_bus' as BusId, 1);
        }).not.toThrow();
    });
});

describe('AudioBusSystem (Getters & Gain Calculations)', () => {
    let system: AudioBusSystem;
    let mockTicker: any;

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
                activeEnvelope: 0.5,
                dispose: vi.fn()
            })
        };

        mockTicker = { add: vi.fn(), remove: vi.fn() };

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

        await system.initialize(mockTicker);
    });

    it('should return buses map and master node', () => {
        const buses = system.getAllBuses();
        expect(buses.size).toBe(2);
        expect(system.getMasterNode()).toBeDefined();
    });

    it('should calculate current gain with and without sidechain', () => {
        expect(system.getCurrentRealGain('sfx' as BusId)).toBe(1);
        expect(system.getCurrentRealGain('ghost' as any)).toBe(0);

        expect(system.getCurrentRealGain('ducked' as BusId)).toBe(0.5);
    });

    it('should compute offline gain transition', () => {
        const normalTransition = system.computeOfflineGainTransition('sfx' as BusId, 0.8);
        expect(normalTransition).toEqual({ from: 1, to: 0.8 });

        const scTransition = system.computeOfflineGainTransition('ducked' as BusId, 0.8);
        expect(scTransition).toEqual({ from: 0.5, to: 0.4 });

        expect(system.computeOfflineGainTransition('ghost' as any, 1)).toEqual({ from: 0, to: 1 });
    });
});
