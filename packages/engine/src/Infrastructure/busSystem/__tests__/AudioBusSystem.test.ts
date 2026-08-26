// oxlint-disable unicorn/no-useless-undefined
// noinspection D

import type { IBuses } from '@domain/BusSystem/Ports/IBuses.js';
import type { ITickable } from '@domain/Shared/Ports/ITickable.js';
import type { IPluginFactory } from '@infrastructure';
import type { AudioNodeLike } from '@infrastructure/types/IAudioContext.js';
import type { BusId, ContextTime, Milliseconds, Seconds } from '@scene-grid/shared';

import AudioBus from '@infrastructure/busSystem/AudioBus.js';
import AudioBusSystem from '@infrastructure/busSystem/AudioBusSystem.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@infrastructure', () => ({
    safeDisconnect: vi.fn((node: any) => {
        if (node.shouldThrow) throw new Error('Disconnect Error');
    })
}));

function createMockNode() {
    return {
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 }
    };
}

function createMockContext() {
    return {
        createGain: vi.fn().mockImplementation(() => createMockNode()),
        createDynamicsCompressor: vi.fn().mockImplementation(() => ({ ...createMockNode(), isNativeFallback: true })),
        state: 'running'
    } as any;
}

describe('AudioBusSystem', () => {
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

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('AudioBusSystem (Routing, Fallbacks & Edge Cases)', () => {
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

            expect(mockTicker.add).toHaveBeenCalledWith('audio-bus-system', 2, expect.any(Object));
            expect(capturedTickTarget).toBeDefined();

            const processFrameSpy = vi.spyOn(AudioBus.prototype, 'processFrame').mockImplementation(() => {});

            capturedTickTarget!.tick(123.45 as ContextTime, 20 as Milliseconds);

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
            system.applySend('sfx' as BusId, 'ghost_bus' as any, null, 100 as Milliseconds);

            expect(updateSendSpy).toHaveBeenCalledWith({
                targetBusId: 'ghost_bus',
                targetNode: null,
                targetGain: null,
                duration: 100 as Milliseconds
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

            mockPluginFactory = {
                createLimiter: vi.fn().mockReturnValue({
                    load: vi.fn(),
                    inputNode: { connect: vi.fn() },
                    outputNode: { connect: vi.fn() }
                }),
                createSidechain: vi.fn().mockReturnValue(mockSidechain),
                getFiltersPlugin: vi.fn().mockReturnValue({
                    inputNode: { connect: vi.fn() },
                    outputNode: { connect: vi.fn() },
                    dispose: vi.fn()
                })
            };

            mockTicker = { add: vi.fn(), remove: vi.fn() };

            system = new AudioBusSystem({
                context: createMockContext(),
                automation: { set: vi.fn(), ramp: vi.fn() } as any,
                masterOutput: { input: {} } as any,
                busConfig: { ducked: { gain: 1, sidechain: { enabled: true } } },
                pluginFactory: mockPluginFactory
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

        beforeEach(async () => {
            vi.clearAllMocks();

            mockPluginFactory = {
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
                }),
                getFiltersPlugin: vi.fn().mockReturnValue({
                    inputNode: { connect: vi.fn() },
                    outputNode: { connect: vi.fn() },
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
                pluginFactory: mockPluginFactory
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

        beforeEach(async () => {
            vi.clearAllMocks();

            mockPluginFactory = {
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
                }),
                getFiltersPlugin: vi.fn().mockReturnValue({
                    inputNode: { connect: vi.fn() },
                    outputNode: { connect: vi.fn() },
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
                pluginFactory: mockPluginFactory
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
            mockPluginFactory = {
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
        beforeEach(() => {
            vi.clearAllMocks();
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
                busConfig: { sfx: {} },
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
            (mockPluginFactory.createSidechain as any).mockReturnValue(throwSidechain);

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

            const mockDucker = {
                start: vi.fn().mockResolvedValue(undefined),
                insertLookahead: vi.fn(),
                dispose: vi.fn()
            };
            (mockPluginFactory.createSidechain as any).mockReturnValue(mockDucker);

            await (system as any).createSidechain('sfx');
            await (system as any).createSidechain('sfx');
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already exists. Disposing old instance'));
            expect(mockDucker.dispose).toHaveBeenCalled();

            const throwDucker = { start: vi.fn().mockRejectedValue(new Error('Start Crash')), dispose: vi.fn() };
            (mockPluginFactory.createSidechain as any).mockReturnValue(throwDucker);
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

            (mockPluginFactory.createLimiter as any).mockImplementation(() => {
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

        describe('AudioBusSystem - fillActiveModifiers', () => {
            let system: AudioBusSystem;

            beforeEach(async () => {
                system = new AudioBusSystem({
                    context: mockContext,
                    automation: mockAutomation,
                    masterOutput: mockMasterOutput,
                    busConfig: {
                        sfx: { gain: 0.5 },
                        music: { gain: 1.0 }
                    },
                    pluginFactory: mockPluginFactory
                });

                await system.initialize(mockTicker);
            });

            it('should fill modifiers correctly for a bus with logical, RTPC, and sidechain active', async () => {
                const audioBusSystem = new AudioBusSystem({
                    context: mockContext,
                    automation: mockAutomation,
                    masterOutput: mockMasterOutput,
                    busConfig: {
                        sfx: { gain: 0.5, sidechain: { enabled: true } }
                    },
                    pluginFactory: mockPluginFactory
                });

                (mockPluginFactory.createSidechain as any).mockReturnValue({
                    activeEnvelope: 0.2,
                    dispose: vi.fn(),
                    start: vi.fn().mockResolvedValue(undefined),
                    insertLookahead: vi.fn()
                });

                await audioBusSystem.initialize(mockTicker);

                const bus = audioBusSystem.getBus('sfx' as BusId)!;

                bus.setGainImmediate(0.8);
                bus.setRtpcGainModifier(0.9);
                bus.processFrame(0 as Seconds);

                const modifiers = [
                    { type: '', value: 0, source: '' },
                    { type: '', value: 0, source: '' },
                    { type: '', value: 0, source: '' }
                ];

                const count = audioBusSystem.fillActiveModifiers('sfx' as BusId, modifiers);

                expect(count).toBe(3);
                expect(modifiers[2].value).toBe(0.8);
            });

            it('should return 0 count if all values are default (1)', () => {
                const modifiers = [{ type: '', value: 0, source: '' }];
                const count = system.fillActiveModifiers('music' as BusId, modifiers);

                expect(count).toBe(0);
            });

            it('should safely return 0 if busId does not exist', () => {
                const modifiers = [{ type: '', value: 0, source: '' }];
                const count = system.fillActiveModifiers('invalid_bus' as BusId, modifiers);

                expect(count).toBe(0);
            });
        });
    });

    describe('AudioBusSystem - HMR (updateConfig)', () => {
        it('should dynamically add buses, update properties, and diff sends/sidechains', async () => {
            mockPluginFactory = {
                createLimiter: vi.fn().mockReturnValue({
                    inputNode: { connect: vi.fn(), disconnect: vi.fn() },
                    outputNode: { connect: vi.fn(), disconnect: vi.fn() },
                    load: vi.fn().mockResolvedValue(undefined),
                    dispose: vi.fn()
                }),
                createSidechain: vi
                    .fn()
                    .mockReturnValue({ start: vi.fn(), insertLookahead: vi.fn(), dispose: vi.fn() }),
                getFiltersPlugin: vi.fn().mockReturnValue({ createNode: vi.fn() })
            };

            const initialConfig = {
                master: { gain: 1 },
                sfx: { gain: 1, sends: { master: 1 }, sidechain: { enabled: true } }
            };

            const system = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: { input: {} } as any,
                busConfig: initialConfig,
                pluginFactory: mockPluginFactory
            });
            await system.initialize(mockTicker);

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
            mockPluginFactory = {
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
                busConfig: initialConfig,
                pluginFactory: mockPluginFactory
            });

            await system.initialize({ add: vi.fn(), remove: vi.fn() } as any);

            const applySendSpy = vi.spyOn(system, 'applySend').mockImplementation(() => {});

            const newConfig = {
                sfx: { gain: 1, sends: { verb: 1.0, master: 0.2 } },
                verb: { gain: 1 },
                delay: { gain: 1 },
                master: { gain: 1 }
            };

            await system.updateConfig(newConfig);

            expect(applySendSpy).toHaveBeenCalledWith('sfx', 'verb', 1.0, 100);

            expect(applySendSpy).toHaveBeenCalledWith('sfx', 'master', 0.2, 100);

            expect(applySendSpy).toHaveBeenCalledWith('sfx', 'delay', null, 100);
        });
    });

    describe('AudioBusSystem - Getters & Gain Inspection', () => {
        // oxlint-disable-next-line require-await
        it('should return configured default gain when bus config exists', async () => {
            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { sfx: { gain: 0.8 } },
                pluginFactory: mockPluginFactory
            });

            const gain = busSystem.getDefaultGain('sfx' as BusId);

            expect(gain).toBe(0.8);
        });

        // oxlint-disable-next-line require-await
        it('should return raw bus config for an existing bus and undefined for non-existent bus or missing config', async () => {
            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { music: { gain: 0.7, rtpc: {} } },
                pluginFactory: mockPluginFactory
            });
            const systemNoConfig = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: null as any,
                pluginFactory: mockPluginFactory
            });

            expect(busSystem.getBaseBusConfig('music' as BusId)).toEqual({ gain: 0.7, rtpc: {} });
            expect(busSystem.getBaseBusConfig('ghost' as BusId)).toBeUndefined();
            expect(systemNoConfig.getBaseBusConfig('music' as BusId)).toBeUndefined();
        });

        it('should return logical and RTPC gains for an existing bus and undefined for unknown buses without throwing', async () => {
            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { sfx: { gain: 1 } },
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);
            const bus = busSystem.getBus('sfx' as BusId)!;
            bus.setGainImmediate(0.6);
            bus.setRtpcGainModifier(0.75);

            expect(busSystem.getBusLogicalGain('sfx' as BusId)).toBe(0.6);
            expect(busSystem.getBusRtpcGain('sfx' as BusId)).toBe(0.75);
            expect(busSystem.getBusLogicalGain('ghost' as BusId)).toBeUndefined();
            expect(busSystem.getBusRtpcGain('ghost' as BusId)).toBeUndefined();
        });

        it('should calculate final effective gain as product of logical target and sidechain gain', async () => {
            mockPluginFactory.createSidechain = vi.fn().mockReturnValue({
                start: vi.fn().mockResolvedValue(undefined),
                insertLookahead: vi.fn(),
                activeEnvelope: 0.5,
                dispose: vi.fn()
            });

            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { ducked: { gain: 1, sidechain: { enabled: true } } },
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);
            const bus = busSystem.getBus('ducked' as BusId)!;
            bus.setGainImmediate(0.8);

            const finalGain = busSystem.getBusFinalGain('ducked' as BusId);
            const ghostGain = busSystem.getBusFinalGain('ghost' as BusId);

            expect(finalGain).toBeCloseTo(0.4);
            expect(ghostGain).toBeUndefined();
        });
    });

    describe('AudioBusSystem - fillActiveModifiers', () => {
        it('should populate modifier type, value, and source descriptors accurately for active modifiers', async () => {
            mockPluginFactory.createSidechain = vi.fn().mockReturnValue({
                start: vi.fn().mockResolvedValue(undefined),
                insertLookahead: vi.fn(),
                activeEnvelope: 0.2,
                dispose: vi.fn()
            });

            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { sfx: { gain: 1, sidechain: { enabled: true } } },
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);

            const bus = busSystem.getBus('sfx' as BusId)!;
            bus.setGainImmediate(0.7);
            bus.setRtpcGainModifier(0.85);
            bus.processFrame(0 as Seconds);

            const modifiers = [
                { type: '', value: 0, source: '' },
                { type: '', value: 0, source: '' },
                { type: '', value: 0, source: '' }
            ];

            const count = busSystem.fillActiveModifiers('sfx' as BusId, modifiers);

            expect(count).toBe(3);
            expect(modifiers[0]).toEqual({
                type: 'LOGICAL',
                value: 0.7,
                source: 'Mixer Snapshot'
            });
            expect(modifiers[1]).toEqual({
                type: 'RTPC',
                value: 0.85,
                source: 'Game Parameter'
            });
            expect(modifiers[2]).toEqual({
                type: 'SIDECHAIN',
                value: 0.8,
                source: 'Active Ducking'
            });
        });
    });

    describe('AudioBusSystem - Gain Transitions & Sidechain Source Management', () => {
        it('should compute offline transition considering sidechain envelope', async () => {
            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: {
                    music: { gain: 1 },
                    ducked: { gain: 1, sidechain: { enabled: true } }
                },
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);

            const directTransition = busSystem.computeOfflineGainTransition('music' as BusId, 0.5);
            expect(directTransition).toEqual({ from: 1, to: 0.5 });

            const duckedTransition = busSystem.computeOfflineGainTransition('ducked' as BusId, 0.8);
            expect(duckedTransition).toEqual({ from: 0.5, to: 0.4 });
        });

        it('should safely fall back in computeOfflineGainTransition if sidechain is deleted concurrently', async () => {
            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { ducked: { gain: 1, sidechain: { enabled: true } } },
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);

            let callCount = 0;
            const sidechainsMap = (busSystem as any).sidechains;
            const originalGet = sidechainsMap.get.bind(sidechainsMap);
            vi.spyOn(sidechainsMap, 'get').mockImplementation(key => {
                callCount++;
                if (callCount === 3) return undefined;
                return originalGet(key);
            });

            const transition = busSystem.computeOfflineGainTransition('ducked' as BusId, 0.8);

            expect(transition).toEqual({ from: 0.5, to: 0.8 });
        });

        it('should not attempt sidechain operations or log warnings when bus has no sidechain', async () => {
            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { music: { gain: 1 } },
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            busSystem.addSidechainSource({} as AudioNodeLike, 'music' as BusId, 0.5);
            busSystem.removeSidechainSource({} as AudioNodeLike, 'music' as BusId);

            expect(warnSpy).not.toHaveBeenCalled();
            warnSpy.mockRestore();
        });
    });

    describe('AudioBusSystem - Routing & Sends', () => {
        it('should connect routerMasterGain directly to postLimiterGain when limiter is disabled', async () => {
            const busSystem = new AudioBusSystem(
                {
                    context: mockContext,
                    automation: mockAutomation,
                    masterOutput: mockMasterOutput,
                    busConfig: { master: { gain: 1 } },
                    pluginFactory: mockPluginFactory
                },
                { isUseLimiter: false }
            );

            await busSystem.initialize(mockTicker);

            const routerGain = (busSystem as any).routerMasterGain;
            const postGain = (busSystem as any).postLimiterGain;
            expect(routerGain.connect).toHaveBeenCalledWith(postGain);
        });

        it('should log precise warning when target bus is missing on active send', async () => {
            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { sfx: { gain: 1 } },
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            busSystem.applySend('sfx' as BusId, 'missing_bus' as BusId, 0.5);

            expect(warnSpy).toHaveBeenCalledWith(
                '[AudioBusSystem] Cannot send from sfx: target bus missing_bus not found.'
            );
            warnSpy.mockRestore();
        });

        it('should not update send if target bus input node is missing and gain is non-null', async () => {
            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { sfx: { gain: 1 }, reverb: { gain: 1 } },
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);

            const sourceBus = busSystem.getBus('sfx' as BusId)!;
            const targetBus = busSystem.getBus('reverb' as BusId)!;

            const inputNodeSpy = vi.spyOn(targetBus, 'inputNode', 'get').mockReturnValue(null as any);
            const updateSendSpy = vi.spyOn(sourceBus, 'updateSend');

            busSystem.applySend('sfx' as BusId, 'reverb' as BusId, 0.5);

            expect(updateSendSpy).not.toHaveBeenCalled();

            inputNodeSpy.mockRestore();
        });
    });

    describe('AudioBusSystem - Limiter & Fallback DynamicsCompressor', () => {
        it('should await load if present and initialize cleanly without load method', async () => {
            const mockLimiterWithLoad = {
                inputNode: mockContext.createGain(),
                outputNode: mockContext.createGain(),
                load: vi.fn().mockResolvedValue(undefined),
                dispose: vi.fn()
            };
            mockPluginFactory.createLimiter = vi.fn().mockReturnValue(mockLimiterWithLoad);

            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { master: { gain: 1 } },
                pluginFactory: mockPluginFactory
            });

            await busSystem.initialize(mockTicker);

            expect(mockLimiterWithLoad.load).toHaveBeenCalledTimes(1);

            const mockLimiterNoLoad = {
                inputNode: mockContext.createGain(),
                outputNode: mockContext.createGain(),
                dispose: vi.fn()
            };
            mockPluginFactory.createLimiter = vi.fn().mockReturnValue(mockLimiterNoLoad);
            const busSystem2 = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { master: { gain: 1 } },
                pluginFactory: mockPluginFactory
            });

            await busSystem2.initialize(mockTicker);
            expect(mockContext.createDynamicsCompressor).not.toHaveBeenCalled();
        });

        it('should configure native fallback compressor parameters and disconnect on dispose', async () => {
            mockPluginFactory.createLimiter = vi.fn().mockImplementation(() => {
                throw new Error('Plugin load failed');
            });
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { master: { gain: 1 } },
                pluginFactory: mockPluginFactory
            });

            await busSystem.initialize(mockTicker);
            const fallbackLimiter = (busSystem as any).masterLimiter;

            const compressor = fallbackLimiter.inputNode;
            expect(compressor.threshold.value).toBe(-3);
            expect(compressor.knee.value).toBe(0);
            expect(compressor.ratio.value).toBe(20);
            expect(compressor.attack.value).toBe(0);
            expect(compressor.release.value).toBe(0.1);

            fallbackLimiter.dispose();

            expect(compressor.disconnect).toHaveBeenCalledTimes(1);
            warnSpy.mockRestore();
        });
    });

    describe('AudioBusSystem - Initialization Details', () => {
        it('should only bind RTPC to buses that explicitly configure it', async () => {
            const bindRtpcSpy = vi.spyOn(AudioBus.prototype, 'bindRTPC');
            const rtpcConfig = {
                gain: {
                    gameParam: 'player_speed' as any,
                    curve: [
                        { x: 0, y: 0 },
                        { x: 1, y: 1 }
                    ]
                }
            };

            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: {
                    sfx: { gain: 1 },
                    music: { gain: 1, rtpc: rtpcConfig }
                },
                pluginFactory: mockPluginFactory
            });

            await busSystem.initialize(mockTicker);

            expect(bindRtpcSpy).toHaveBeenCalledTimes(1);
            expect(bindRtpcSpy).toHaveBeenCalledWith(rtpcConfig);

            bindRtpcSpy.mockRestore();
        });

        it('should not warn on first-time sidechain creation and await empty promise array when no sidechains exist', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const promiseAllSpy = vi.spyOn(Promise, 'all');

            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { sfx: { gain: 1 } },
                pluginFactory: mockPluginFactory
            });

            await busSystem.initialize(mockTicker);

            expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('already exists'));
            expect(promiseAllSpy).toHaveBeenCalledWith([]);

            warnSpy.mockRestore();
            promiseAllSpy.mockRestore();
        });

        it('should safely handle disposing old sidechain even if sidechains map contains nullish value', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { sfx: { gain: 1 } },
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);

            (busSystem as any).sidechains.set('sfx', undefined);

            await expect((busSystem as any).createSidechain('sfx')).resolves.not.toThrow();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining("Sidechain for bus 'sfx' already exists. Disposing old instance.")
            );

            warnSpy.mockRestore();
        });
    });

    describe('AudioBusSystem - HMR (updateConfig) Send Diffing & Sidechain Lifecycle', () => {
        it('should safely execute updateConfig when previous busConfig was null', async () => {
            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: null as any,
                pluginFactory: mockPluginFactory
            });

            await expect(busSystem.updateConfig({ sfx: { gain: 0.8 } })).resolves.not.toThrow();
        });

        it('should not disconnect retained sends and should pass empty promises array when no new sidechains added', async () => {
            const initialConfig = {
                sfx: { gain: 1, sends: { verb: 0.5, delay: 0.5 } },
                verb: { gain: 1 },
                delay: { gain: 1 }
            };

            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: initialConfig,
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);

            const applySendSpy = vi.spyOn(busSystem, 'applySend').mockImplementation(() => {});
            const promiseAllSpy = vi.spyOn(Promise, 'all');

            const newConfig = {
                sfx: { gain: 1, sends: { verb: 0.8 } },
                verb: { gain: 1 },
                delay: { gain: 1 }
            };

            await busSystem.updateConfig(newConfig);

            expect(applySendSpy).toHaveBeenCalledWith('sfx', 'verb', 0.8, 100);
            expect(applySendSpy).toHaveBeenCalledWith('sfx', 'delay', null, 100);
            expect(applySendSpy).not.toHaveBeenCalledWith('sfx', 'verb', null, 100);
            expect(applySendSpy).toHaveBeenCalledTimes(2);

            expect(promiseAllSpy).toHaveBeenCalledWith([]);

            promiseAllSpy.mockRestore();
        });

        it('should preserve and not dispose sidechains that remain enabled across config updates', async () => {
            const initialConfig = {
                sfx: { gain: 1, sidechain: { enabled: true } }
            };

            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: initialConfig,
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);

            const existingDucker = busSystem.getSidechain('sfx');
            expect(existingDucker).toBeDefined();

            const createSidechainSpy = vi.spyOn(busSystem as any, 'createSidechain');

            const newConfig = {
                sfx: { gain: 0.5, sidechain: { enabled: true } }
            };

            await busSystem.updateConfig(newConfig);

            expect(busSystem.getSidechain('sfx')).toBe(existingDucker);
            expect(existingDucker!.dispose).not.toHaveBeenCalled();
            expect(createSidechainSpy).not.toHaveBeenCalled();
        });

        it('should safely handle sidechains delete during HMR if sidechain instance is nullish', async () => {
            const busSystem = new AudioBusSystem({
                context: mockContext,
                automation: mockAutomation,
                masterOutput: mockMasterOutput,
                busConfig: { sfx: { gain: 1, sidechain: { enabled: true } } },
                pluginFactory: mockPluginFactory
            });
            await busSystem.initialize(mockTicker);

            (busSystem as any).sidechains.set('sfx', undefined);

            const newConfig = {
                sfx: { gain: 1, sidechain: { enabled: false } }
            };

            await expect(busSystem.updateConfig(newConfig)).resolves.not.toThrow();
            expect((busSystem as any).sidechains.has('sfx')).toBe(false);
        });
    });
});
