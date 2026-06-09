// oxlint-disable unicorn/no-useless-undefined
// noinspection D

import { describe, it, expect, vi, beforeEach } from 'vitest';

import AudioBus from '@infrastructure/busSystem/AudioBus.js';
import AudioBusSystem from '@infrastructure/busSystem/AudioBusSystem.js';

import type { IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type { BusId } from '@scene-grid/shared';
import type { IPluginFactory } from '@infrastructure';
import type { AudioNodeLike } from '@infrastructure/types/IAudioContext.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';

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

    let capturedTickTarget: ITickable | null;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedTickTarget = null;

        mockContext = createMockContext();
        mockAutomation = { ramp: vi.fn(), set: vi.fn() };
        mockMasterOutput = { input: {} };

        mockBusConfig = {
            music: { gain: 1 },
            sfx: { gain: 0.8, sends: { ['music' as BusId]: 0.5 } }
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
            add: vi.fn().mockImplementation((id: string, rate: number, target: ITickable) => {
                capturedTickTarget = target;
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

        expect(mockTicker.add).toHaveBeenCalledWith('audio-bus-system', 20, expect.any(Object));
        expect(capturedTickTarget).toBeDefined();

        const processFrameSpy = vi.spyOn(AudioBus.prototype, 'processFrame').mockImplementation(() => {});

        capturedTickTarget!.tick(123.45, 20);

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

    it('should bind RTPC config to the bus during initialization if defined in config', async () => {
        const bindRtpcSpy = vi.spyOn(AudioBus.prototype, 'bindRTPC').mockImplementation(() => {});

        const configWithRtpc = {
            ...mockBusConfig,
            music: {
                gain: 1,
                rtpc: {
                    filterFrequency: {
                        gameParam: 'underwater_state' as any,
                        curve: [
                            { x: 0, y: 20000 },
                            { x: 1, y: 500 }
                        ]
                    }
                }
            }
        };

        const busSystem = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: configWithRtpc,
            pluginFactory: mockPluginFactory
        });

        await busSystem.initialize(mockTicker);

        expect(bindRtpcSpy).toHaveBeenCalled();
        expect(bindRtpcSpy).toHaveBeenCalledWith(configWithRtpc.music.rtpc);

        bindRtpcSpy.mockRestore();
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

describe('AudioBusSystem (RTPC Pull Model)', () => {
    let system: AudioBusSystem;
    let mockTicker: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        const mockContext = createMockContext();

        const mockPluginFactory = {
            createLimiter: vi.fn().mockReturnValue({
                load: vi.fn(),
                inputNode: { connect: vi.fn() },
                outputNode: { connect: vi.fn() }
            }),
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
                music: { gain: 1 }
            },
            pluginFactory: mockPluginFactory as any
        });

        await system.initialize(mockTicker);
    });

    it('should propagate tickRTPC to all active hot path buses in a flat loop', () => {
        const tickRtpcSpy = vi.spyOn(AudioBus.prototype, 'tickRTPC').mockImplementation(() => {});

        const mockRtpcAdapter = {
            getValue: vi.fn().mockReturnValue(50)
        } as any;

        system.tickRTPC(mockRtpcAdapter);

        expect(tickRtpcSpy).toHaveBeenCalledTimes(2);

        expect(tickRtpcSpy).toHaveBeenCalledWith(mockRtpcAdapter);

        tickRtpcSpy.mockRestore();
    });
});

describe('Bug repro: Base Config Routing & FX Retention', () => {
    it('should correctly initialize base sends and filters before any snapshots are applied', async () => {
        const mockContext = createMockContext();
        const mockPluginFactory = {
            createLimiter: vi.fn().mockReturnValue({
                load: vi.fn(),
                inputNode: { connect: vi.fn() },
                outputNode: { connect: vi.fn() }
            }),
            getFiltersPlugin: vi.fn().mockReturnValue({
                inputNode: { connect: vi.fn() },
                outputNode: { connect: vi.fn() },
                dispose: vi.fn(),
                createNode: vi.fn().mockReturnValue({ connect: vi.fn(), disconnect: vi.fn() })
            })
        } as any;

        const baseConfig: IBuses = {
            ['FX_REVERB' as BusId]: { gain: 1, filter: { type: 'reverb' as any, reverbTime: 2.5 } },
            ['SFX_COINS' as BusId]: { gain: 1, sends: { ['FX_REVERB' as BusId]: 0.5 } }
        };

        const applySendSpy = vi.spyOn(AudioBusSystem.prototype, 'applySend');

        const system = new AudioBusSystem({
            context: mockContext,
            automation: { set: vi.fn(), ramp: vi.fn() } as any,
            masterOutput: { input: {} } as any,
            busConfig: baseConfig,
            pluginFactory: mockPluginFactory
        });

        await system.initialize({ add: vi.fn(), remove: vi.fn() } as any);

        const fxBus = system.getBus('FX_REVERB' as BusId);
        const sfxBus = system.getBus('SFX_COINS' as BusId);

        expect(fxBus).toBeDefined();
        expect(sfxBus).toBeDefined();

        expect(applySendSpy).toHaveBeenCalledWith('SFX_COINS', 'FX_REVERB', 0.5, 0);

        applySendSpy.mockRestore();
    });
});

describe('AudioBusSystem (Internal Edge Cases & 100% Coverage)', () => {
    let mockContext: any;
    let mockAutomation: any;
    let mockMasterOutput: any;
    let mockBusConfig: any;
    let mockPluginFactory: any;
    let mockTicker: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockContext = createMockContext();
        mockAutomation = { ramp: vi.fn(), set: vi.fn() };
        mockMasterOutput = { input: {} };
        mockTicker = { add: vi.fn(), remove: vi.fn() };
        mockBusConfig = { sfx: { gain: 1, sidechain: { enabled: true } } };

        mockPluginFactory = {
            createLimiter: vi.fn().mockReturnValue({
                inputNode: { connect: vi.fn() },
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
            getFiltersPlugin: vi.fn().mockReturnValue({ createNode: vi.fn() })
        };
    });

    it('should return 0 in getDefaultGain if config or gain is missing', () => {
        const systemNoConfig = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: null as any,
            pluginFactory: mockPluginFactory
        });
        expect(systemNoConfig.getDefaultGain('sfx' as BusId)).toBe(0);

        const systemNoGain = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: { sfx: {} } as any,
            pluginFactory: mockPluginFactory
        });
        expect(systemNoGain.getDefaultGain('sfx' as BusId)).toBe(0);
    });

    it('should fallback if sidechain disappears between get calls in computeOfflineGainTransition', async () => {
        const system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });
        await system.initialize(mockTicker);

        let getCount = 0;
        const mockMap = new Map();
        mockMap.get = vi.fn(() => {
            getCount++;
            return getCount === 1 ? {} : undefined;
        });
        (system as any).sidechains = mockMap;

        const result = system.computeOfflineGainTransition('sfx' as BusId, 0.8);
        expect(result.to).toBe(0.8);
    });

    it('should catch and warn on sidechain addSource and removeAllSources errors', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const throwSidechain = {
            addSource: vi.fn(() => {
                throw new Error('AddError');
            }),
            removeAllSources: vi.fn(() => {
                throw new Error('ClearError');
            }),
            insertLookahead: vi.fn(),
            start: vi.fn(),
            dispose: vi.fn(),
            activeEnvelope: 0
        };
        mockPluginFactory.createSidechain.mockReturnValue(throwSidechain);

        const system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: mockBusConfig,
            pluginFactory: mockPluginFactory
        });
        await system.initialize(mockTicker);

        system.addSidechainSource({} as any, 'sfx' as BusId, 1);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to add source to sidechain'),
            expect.any(Error)
        );

        system.clearAllSidechainTriggers();
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to clear sidechain sources'),
            expect.any(Error)
        );

        warnSpy.mockRestore();
    });

    it('should handle missing bus, existing instances, and start errors in createSidechain', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: { sfx: { gain: 1 } },
            pluginFactory: mockPluginFactory
        });
        await system.initialize(mockTicker);

        await (system as any).createSidechain('ghost_bus');
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("Cannot create sidechain: Bus 'ghost_bus' not found.")
        );

        const mockDucker = { start: vi.fn().mockResolvedValue(undefined), insertLookahead: vi.fn(), dispose: vi.fn() };
        mockPluginFactory.createSidechain.mockReturnValue(mockDucker);

        await (system as any).createSidechain('sfx');
        await (system as any).createSidechain('sfx');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already exists. Disposing old instance'));
        expect(mockDucker.dispose).toHaveBeenCalled();

        const throwDucker = { start: vi.fn().mockRejectedValue(new Error('Start Crash')), dispose: vi.fn() };
        mockPluginFactory.createSidechain.mockReturnValue(throwDucker);
        await (system as any).createSidechain('sfx');
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining("Failed to start sidechain for bus 'sfx'"),
            expect.any(Error)
        );
        expect(throwDucker.dispose).toHaveBeenCalled();

        warnSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('should catch errors silently inside fallback limiter dispose', async () => {
        const mockFallbackNode = {
            threshold: { value: 0 },
            knee: { value: 0 },
            ratio: { value: 0 },
            attack: { value: 0 },
            release: { value: 0 },
            connect: vi.fn(),
            disconnect: vi.fn(() => {
                throw new Error('Disconnect failed');
            })
        };
        mockContext.createDynamicsCompressor.mockReturnValue(mockFallbackNode);

        mockPluginFactory.createLimiter.mockImplementation(() => {
            throw new Error('Force Fallback');
        });

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation,
            masterOutput: mockMasterOutput,
            busConfig: { master: { gain: 1 } },
            pluginFactory: mockPluginFactory
        });
        await system.initialize(mockTicker);

        const fallbackLimiter = (system as any).masterLimiter;

        expect(() => fallbackLimiter.dispose()).not.toThrow();

        warnSpy.mockRestore();
    });
});

describe('AudioBusSystem - HMR (updateConfig)', () => {
    it('should dynamically add buses, update properties, and diff sends/sidechains', async () => {
        const mockContext = createMockContext();
        const mockAutomation = { ramp: vi.fn(), set: vi.fn() };
        const mockTicker = { add: vi.fn(), remove: vi.fn() };
        const mockPluginFactory = {
            createLimiter: vi.fn().mockReturnValue({
                inputNode: { connect: vi.fn(), disconnect: vi.fn() },
                outputNode: { connect: vi.fn(), disconnect: vi.fn() },
                load: vi.fn().mockResolvedValue(undefined),
                dispose: vi.fn()
            }),
            createSidechain: vi.fn().mockReturnValue({ start: vi.fn(), insertLookahead: vi.fn(), dispose: vi.fn() }),
            getFiltersPlugin: vi.fn().mockReturnValue({ createNode: vi.fn() })
        };

        const initialConfig = {
            master: { gain: 1 },
            sfx: { gain: 1, sends: { master: 1 }, sidechain: { enabled: true } }
        };

        const system = new AudioBusSystem({
            context: mockContext,
            automation: mockAutomation as any,
            masterOutput: { input: {} } as any,
            busConfig: initialConfig as any,
            pluginFactory: mockPluginFactory as any
        });
        await system.initialize(mockTicker as any);

        const applySendSpy = vi.spyOn(system, 'applySend').mockImplementation(() => {});
        const createSidechainSpy = vi.spyOn(system as any, 'createSidechain').mockResolvedValue(undefined);
        const sfxBus = system.getBus('sfx' as any);
        const replaceFilterSpy = vi.spyOn(sfxBus!, 'safeReplaceFilter');

        const newConfig = {
            master: { gain: 1 },
            sfx: { gain: 0.5, filter: { type: 'lowpass', frequency: 500 } },
            music: { gain: 1, rtpc: { gain: { gameParam: 'vol', curve: [] } }, sidechain: { enabled: true } }
        };

        await system.updateConfig(newConfig as any);

        expect(system.getBus('music' as any)).toBeDefined();

        expect(replaceFilterSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'lowpass' }), 100);

        expect(applySendSpy).toHaveBeenCalledWith('sfx', 'master', null, 100);

        expect(createSidechainSpy).toHaveBeenCalledWith('music');

        expect((system as any).sidechains.has('sfx')).toBe(false);
    });

    it('should correctly diff and apply sends (add, update, remove) during HMR', async () => {
        const mockContext = createMockContext();
        const mockPluginFactory = {
            createLimiter: vi.fn().mockReturnValue({
                inputNode: { connect: vi.fn(), disconnect: vi.fn() },
                outputNode: { connect: vi.fn(), disconnect: vi.fn() },
                load: vi.fn().mockResolvedValue(undefined),
                dispose: vi.fn()
            }),
            createSidechain: vi.fn(),
            getFiltersPlugin: vi.fn().mockReturnValue({ createNode: vi.fn() })
        };

        const initialConfig = {
            sfx: { gain: 1, sends: { verb: 0.5, delay: 0.8 } },
            verb: { gain: 1 },
            delay: { gain: 1 },
            master: { gain: 1 }
        };

        const system = new AudioBusSystem({
            context: mockContext,
            automation: { ramp: vi.fn(), set: vi.fn() } as any,
            masterOutput: { input: {} } as any,
            busConfig: initialConfig as any,
            pluginFactory: mockPluginFactory as any
        });

        await system.initialize({ add: vi.fn(), remove: vi.fn() } as any);

        const applySendSpy = vi.spyOn(system, 'applySend').mockImplementation(() => {});

        const newConfig = {
            sfx: { gain: 1, sends: { verb: 1.0, master: 0.2 } },
            verb: { gain: 1 },
            delay: { gain: 1 },
            master: { gain: 1 }
        };

        await system.updateConfig(newConfig as any);

        expect(applySendSpy).toHaveBeenCalledWith('sfx', 'verb', 1.0, 100);

        expect(applySendSpy).toHaveBeenCalledWith('sfx', 'master', 0.2, 100);

        expect(applySendSpy).toHaveBeenCalledWith('sfx', 'delay', null, 100);
    });
});
