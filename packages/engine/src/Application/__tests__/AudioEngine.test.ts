// oxlint-disable unicorn/no-useless-undefined no-underscore-dangle
// noinspection D

import type {
    BankId,
    BusId,
    GameParamId,
    Milliseconds,
    PlaybackId,
    RegionId,
    SnapshotId,
    SoundId
} from '@scene-grid/shared';

import { AudioEngine } from '@application/AudioEngine.js';
import { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';
import MixerCoordinator from '@domain/Mixer/MixerCoordinator.js';
import { PRIORITY } from '@domain/Mixer/MixerLayer.js';
import { MusicConductor } from '@domain/Orchestration/MusicConductor.js';
import AudioRouter from '@domain/Router/AudioRouter.js';
import ConsistencyChecker from '@domain/Validation/ConsistencyChecker.js';
import { SoundController, SoundPoolManager, SoundInstance, AudioContextManager, FiltersPlugin } from '@infrastructure';
import RTPCManager from '@kernel/RTPC/RTPCManager.js';
import { AudioContext, registrar } from 'standardized-audio-context-mock';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('worker-timers', () => ({
    setInterval: vi.fn((cb: Function, ms: number) => globalThis.setInterval(cb, ms)),
    clearInterval: vi.fn((id: number) => {
        globalThis.clearInterval(id);
    }),
    setTimeout: vi.fn((cb: Function, ms: number) => globalThis.setTimeout(cb, ms)),
    clearTimeout: vi.fn((id: number) => {
        globalThis.clearTimeout(id);
    })
}));

vi.mock('@domain/Culling/VoiceCullingArbiter.js', () => ({
    VoiceCullingArbiter: vi.fn().mockImplementation(function () {
        return { evaluate: vi.fn().mockReturnValue({ toVirtualize: [], toDevirtualize: [] }) };
    })
}));

vi.mock('@infrastructure', async importOriginal => {
    const actual = await importOriginal<any>();
    // oxlint-disable-next-line typescript/no-unsafe-return
    return {
        ...actual,
        AudioContextManager: vi.fn().mockImplementation(function () {
            const mockContext = new AudioContext();

            return {
                context: mockContext,
                resume: vi.fn().mockResolvedValue(undefined),
                initSpatial: vi.fn(),
                setListenerPosition: vi.fn(),
                setListenerOrientation: vi.fn()
            };
        }),
        SoundInstance: vi.fn().mockImplementation(function (id) {
            return { id, connect: vi.fn(), disconnect: vi.fn() };
        }),
        AudioBufferLoader: vi.fn().mockImplementation(function () {
            return {
                getBuffer: vi.fn().mockReturnValue(new ArrayBuffer(8)),
                purgeUrls: vi.fn(),
                getCurrentRam: vi.fn(),
                load: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
                // oxlint-disable-next-line require-await
                loadBatch: vi.fn().mockImplementation(async (urls, onProgress, onError) => {
                    const results: any = {};
                    let loaded = 0;
                    const total = Object.keys(urls).length;
                    for (const [key, { url }] of Object.entries(urls as Record<string, { url: string }>)) {
                        loaded++;
                        if (url.includes('fail')) {
                            if (onError) onError(key, new Error('Network error'));
                        } else {
                            results[key] = new ArrayBuffer(8);
                        }
                        if (onProgress) onProgress(loaded, total, key);
                    }
                    return results;
                })
            };
        }),
        SoundPoolManager: vi.fn().mockImplementation(function (factory, options) {
            (globalThis as any).__mockSoundPoolConfig = options;

            return {
                events: {
                    on: vi.fn().mockReturnThis(),
                    off: vi.fn().mockReturnThis(),
                    emit: vi.fn().mockReturnThis(),
                    once: vi.fn().mockReturnThis()
                },
                getVoice: vi.fn(),
                purgeSound: vi.fn(),
                globalVoiceLimit: 32
            };
        }),

        CullingRunner: vi.fn().mockImplementation(function (arbiter, controller, contextProvider) {
            (globalThis as any).__mockCullingContext = contextProvider;
            const runnerInstance = { start: vi.fn(), stop: vi.fn(), tick: vi.fn() };
            (globalThis as any).__mockCullingRunnerInstance = runnerInstance;
            return runnerInstance;
        }),
        SidechainDucker: vi.fn().mockImplementation(function () {
            return { insertLookahead: vi.fn(), start: vi.fn(), activeEnvelope: 0 };
        }),
        TinyLimiterNode: vi.fn().mockImplementation(function () {
            return {
                load: vi.fn().mockResolvedValue(true),
                inputNode: { connect: vi.fn() },
                outputNode: { connect: vi.fn() }
            };
        }),
        TelemetrySnapshotter: vi.fn().mockImplementation(function (...args: unknown[]) {
            (globalThis as any).__mockSnapshotterArgs = args;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            return { TICK_DIVIDER: 1 as any, tick: vi.fn() };
        })
    };
});

vi.mock('@domain/Validation/ConsistencyChecker.js', () => ({
    default: {
        validate: vi.fn().mockReturnValue(true)
    }
}));

// eslint-disable-next-line @typescript-eslint/naming-convention
const mockMessagePort = {
    start: vi.fn(),
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn()
};

vi.stubGlobal(
    'SharedWorker',
    class SharedWorkerMock {
        public port = mockMessagePort;
        // oxlint-disable-next-line no-useless-constructor
        constructor() {}
    }
);

describe('AudioEngine', () => {
    let engine: AudioEngine;
    let mockVoice: any;

    let playSpy: any;
    let stopSpy: any;
    let pauseSpy: any;
    let resumeSoundSpy: any;
    // oxlint-disable-next-line no-unused-vars
    let getLogicalVoiceSpy: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        playSpy = vi.spyOn(AudioRouter.prototype, 'play').mockReturnValue(42 as PlaybackId);
        stopSpy = vi.spyOn(AudioRouter.prototype, 'stop').mockImplementation(() => {});
        pauseSpy = vi.spyOn(AudioRouter.prototype, 'pause').mockReturnValue();
        resumeSoundSpy = vi.spyOn(AudioRouter.prototype, 'resume').mockImplementation(() => {});

        mockVoice = {
            position: { x: 0, y: 0, z: 0 },
            physicalInstance: {
                pannerNode: {
                    positionX: { value: 0 },
                    positionY: { value: 0 },
                    positionZ: { value: 0 },
                    setPosition: vi.fn()
                }
            }
        };
        getLogicalVoiceSpy = vi.spyOn(SoundController.prototype, 'getLogicalVoice').mockReturnValue(mockVoice);

        engine = new AudioEngine({
            manifest: {
                ['test_sound' as SoundId]: { url: 'audio/test.mp3' },
                ['sound_no_voice' as SoundId]: { url: 'audio/no_voice.mp3' }
            },
            buses: {
                master: { gain: 1 },
                sfx: { gain: 1, sidechain: { enabled: true } }
            },
            snapshots: {},
            events: {},
            soundMap: {
                ['test_sound' as SoundId]: { busId: 'sfx', voice: { priority: 5 }, spatial: true },
                ['sound_no_voice' as SoundId]: { busId: 'master' }
            } as any,
            banks: {
                ['Bank_A' as BankId]: { id: 'Bank_A' as BankId, sounds: ['test_sound', 'sound_no_voice'] as SoundId[] }
            },
            globalVoiceLimit: 32
        });

        await engine.init();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (engine?.['_debug']?.contextManager?.context) {
            registrar.reset(engine['_debug'].contextManager.context as any);
        }
        delete (globalThis as any).__mockSoundPoolConfig;
        delete (globalThis as any).__mockSoundPoolFactory;
        delete (globalThis as any).__mockCullingContext;
    });

    describe('Initialization Edge Cases', () => {
        it('should return early if already initialized', async () => {
            const logSpy = vi.spyOn(console, 'log');
            await engine.init();
            expect(logSpy).toHaveBeenCalledTimes(1);
        });

        it('should warn if config is invalid', async () => {
            const warnSpy = vi.spyOn(console, 'warn');
            (ConsistencyChecker.validate as any).mockReturnValueOnce(false);
            const badEngine = new AudioEngine({
                manifest: {},
                buses: {},
                snapshots: {},
                soundMap: {},
                events: {},
                banks: {}
            });
            await badEngine.init();
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('initialized with errors'));
        });

        it('should emit engine:error and exit early if strict validation fails', async () => {
            (ConsistencyChecker.validate as any).mockReturnValueOnce(false);

            const badEngine = new AudioEngine({
                manifest: {},
                buses: {},
                snapshots: {},
                soundMap: {},
                events: {},
                banks: {}
            });
            const errorSpy = vi.fn();
            badEngine.events.on('engine:error', errorSpy);

            await badEngine.init({ isStrictValidation: true });

            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('initialized with errors'));
            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 'INIT_FAILED',
                    message: 'Strict validation failed'
                })
            );
        });

        it('should initialize RTPC manifest if provided in config', async () => {
            const configSpy = vi.spyOn(RTPCManager.prototype, 'configureParam');
            const setSpy = vi.spyOn(RTPCManager.prototype, 'setValue');

            const rtpcEngine = new AudioEngine({
                manifest: {},
                buses: { master: { gain: 1 } },
                snapshots: {},
                soundMap: {},
                events: {},
                rtpcManifest: {
                    ['health' as GameParamId]: {
                        attack: 100 as Milliseconds,
                        release: 200 as Milliseconds,
                        defaultValue: 100
                    },
                    ['speed' as GameParamId]: { attack: 50 as Milliseconds }
                },
                banks: {}
            });
            await rtpcEngine.init();

            expect(setSpy).toHaveBeenCalledWith('health', 100);

            expect(configSpy).toHaveBeenCalledWith('health', 100, 200);
            expect(configSpy).toHaveBeenCalledWith('speed', 50, 0);

            configSpy.mockRestore();
            setSpy.mockRestore();
        });
    });

    describe('Event Dispatcher & Lifecycle Events', () => {
        it('should expose public event API (on, off, once, clear)', () => {
            expect(engine.events.on).toBeInstanceOf(Function);
            expect(engine.events.off).toBeInstanceOf(Function);
            expect(engine.events.once).toBeInstanceOf(Function);
            expect(engine.events.clear).toBeInstanceOf(Function);
        });

        it('should successfully subscribe and unsubscribe from events', () => {
            const handler = vi.fn();
            engine.events.on('state:suspended', handler);
            engine.events.off('state:suspended', handler);

            const mockManager = engine._debug.contextManager as any;
            if (mockManager.onStateChange) mockManager.onStateChange('suspended');

            expect(handler).not.toHaveBeenCalled();
        });

        it('should support once() subscriptions', () => {
            const handler = vi.fn();
            engine.events.once('state:suspended', handler);

            const mockManager = engine._debug.contextManager as any;
            if (mockManager.onStateChange) {
                mockManager.onStateChange('suspended');
                mockManager.onStateChange('suspended');
            }

            expect(handler).toHaveBeenCalledTimes(1);
        });

        it('should clear all events when events.clear() is called', () => {
            const handler = vi.fn();
            engine.events.on('state:suspended', handler);
            engine.events.clear();

            const mockManager = engine._debug.contextManager as any;
            if (mockManager.onStateChange) mockManager.onStateChange('suspended');

            expect(handler).not.toHaveBeenCalled();
        });

        it('should emit load:start, load:progress, and load:complete during BANK LOAD, not init', async () => {
            const freshEngine = new AudioEngine({
                manifest: {
                    ['sound1' as SoundId]: { url: 'audio/1.mp3' },
                    ['sound2' as SoundId]: { url: 'audio/2.mp3' }
                },
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {},
                events: {},
                banks: {
                    ['Bank_A' as BankId]: { id: 'Bank_A' as BankId, sounds: ['sound1', 'sound2'] as SoundId[] }
                }
            });

            await freshEngine.init();

            const startSpy = vi.fn();
            const progressSpy = vi.fn();
            const completeSpy = vi.fn();

            freshEngine.events.on('load:start', startSpy);
            freshEngine.events.on('load:progress', progressSpy);
            freshEngine.events.on('load:complete', completeSpy);

            await freshEngine.banks.load('Bank_A');

            expect(startSpy).toHaveBeenCalledWith({ totalItems: 2 });
            expect(progressSpy).toHaveBeenCalledTimes(2);
            expect(progressSpy).toHaveBeenLastCalledWith(expect.objectContaining({ progress: 1, loadedItems: 2 }));
            expect(completeSpy).toHaveBeenCalledWith(expect.objectContaining({ failedItems: [] }));
        });

        it('should emit load:complete immediately if bank is empty', async () => {
            const emptyEngine = new AudioEngine({
                manifest: {},
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {},
                events: {},
                banks: {
                    ['Bank_Empty' as BankId]: { id: 'Bank_Empty' as BankId, sounds: [] }
                }
            });

            await emptyEngine.init();

            const completeSpy = vi.fn();
            emptyEngine.events.on('load:complete', completeSpy);

            await emptyEngine.banks.load('Bank_Empty');

            expect(completeSpy).toHaveBeenCalledWith({ failedItems: [], durationMs: 0 });
        });

        it('should emit engine:error for failed files during bank load', async () => {
            const errorEngine = new AudioEngine({
                manifest: {
                    ['good' as SoundId]: { url: 'audio/good.mp3' },
                    ['bad' as SoundId]: { url: 'audio/fail.mp3' }
                },
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {},
                events: {},
                banks: {
                    ['Bank_Mixed' as BankId]: { id: 'Bank_Mixed' as BankId, sounds: ['good', 'bad'] as SoundId[] }
                }
            });

            await errorEngine.init();

            const errorSpy = vi.fn();
            const completeSpy = vi.fn();
            errorEngine.events.on('engine:error', errorSpy);
            errorEngine.events.on('load:complete', completeSpy);

            try {
                await errorEngine.banks.load('Bank_Mixed');
            } catch {
                // Ignore thrown error for test
            }

            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 'DECODE_ERROR',
                    message: 'Failed to load resource: bad'
                })
            );
            expect(completeSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    failedItems: ['bad']
                })
            );
        });

        it('should emit unload:complete when a bank is unloaded', async () => {
            const unloadSpy = vi.fn();
            engine.events.on('unload:complete', unloadSpy);

            await engine.banks.load('Bank_A');
            engine.banks.unload('Bank_A');

            expect(unloadSpy).toHaveBeenCalledWith({ bankId: 'Bank_A' });
        });

        it('should emit state:suspended and state:resumed when context state changes', async () => {
            const freshEngine = new AudioEngine({
                manifest: {},
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {},
                events: {},
                banks: {}
            });

            const suspendSpy = vi.fn();
            const resumeSpy = vi.fn();
            freshEngine.events.on('state:suspended', suspendSpy);
            freshEngine.events.on('state:resumed', resumeSpy);

            await freshEngine.init();

            const mockManager = freshEngine._debug.contextManager as any;

            mockManager.onStateChange('suspended');
            expect(suspendSpy).toHaveBeenCalledTimes(1);

            mockManager.onStateChange('running');
            expect(resumeSpy).toHaveBeenCalledTimes(1);
        });

        it('should catch critical init errors, emit engine:error, and rethrow', async () => {
            const fatalError = new Error('Fatal core error');
            vi.mocked(AudioContextManager).mockImplementationOnce(function () {
                throw fatalError;
            });

            const brokenEngine = new AudioEngine({
                manifest: {},
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {},
                events: {},
                banks: {}
            });
            const errorSpy = vi.fn();
            brokenEngine.events.on('engine:error', errorSpy);

            await expect(brokenEngine.init()).rejects.toThrow('Fatal core error');

            expect(errorSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    code: 'INIT_FAILED',
                    message: 'Fatal core error',
                    details: fatalError
                })
            );
        });
    });

    describe('Facade API (params, mixer, music, misc)', () => {
        describe('banks API', () => {
            it('should load, unload and track bank states', async () => {
                expect(engine.banks.getState('Bank_A')).toBe('UNLOADED');

                const loadPromise = engine.banks.load('Bank_A');
                expect(engine.banks.getState('Bank_A')).toBe('LOADING');

                await loadPromise;
                expect(engine.banks.getState('Bank_A')).toBe('LOADED');

                engine.banks.unload('Bank_A');
                expect(engine.banks.getState('Bank_A')).toBe('UNLOADED');
            });

            it('should safely ignore operations on unknown banks', async () => {
                await expect(engine.banks.load('Bank_Ghost')).resolves.not.toThrow();
                expect(() => {
                    engine.banks.unload('Bank_Ghost');
                }).not.toThrow();
                expect(engine.banks.getState('Bank_Ghost')).toBe('UNLOADED');
            });
        });

        it('should delegate params.set and params.get to RTPCManager', () => {
            const debugObject = engine._debug;
            const setSpy = vi.spyOn(debugObject.rtpcManager, 'setValue').mockImplementation(() => {});
            const getSpy = vi.spyOn(debugObject.rtpcManager, 'getValue').mockReturnValue(0.5);

            engine.params.set('health', 50);
            expect(setSpy).toHaveBeenCalledWith('health', 50);

            const value = engine.params.get('health');
            expect(getSpy).toHaveBeenCalledWith('health');
            expect(value).toBe(0.5);
        });

        it('should delegate mixer.addModifier and mixer.pop to SnapshotManager', () => {
            expect(() => {
                engine.mixer.addModifier('pauseMenu', 'layer1', 100);
            }).not.toThrow();
            expect(() => {
                engine.mixer.removeModifier('layer1');
            }).not.toThrow();
        });

        it('should delegate music loops and transitions to Sequencer', () => {
            expect(() => {
                engine.music.playLoop('bgm', 'verse1');
            }).not.toThrow();
            expect(() => {
                engine.music.stopLoop('bgm');
            }).not.toThrow();
            expect(() => {
                engine.music.playStinger('bgm', 'NextBeat');
            }).not.toThrow();
            expect(() => {
                engine.music.transitionTo({ soundId: 'bgm' as SoundId, targetRegion: 'chorus' as RegionId });
            }).not.toThrow();
        });

        it('should call resume on unlock()', async () => {
            await expect(engine.unlock()).resolves.not.toThrow();
        });

        it('should delegate mixer.setState to SnapshotManager with scene_main and BASE priority', () => {
            const debugObject = engine._debug;
            const activateSpy = vi.spyOn(debugObject.snapshotManager, 'activateSnapshot').mockImplementation(() => {});

            engine.mixer.setState('main_menu', 500);

            expect(activateSpy).toHaveBeenCalledWith('main_menu', 'scene_main', PRIORITY.BASE, 500);
            activateSpy.mockRestore();
        });
    });

    describe('Callbacks and Inner Factories (SoundPool, PluginFactory, Culling)', () => {
        it('should resolve voice config from soundMap in SoundPoolManager', () => {
            const poolOptions = (globalThis as any).__mockSoundPoolConfig;

            const cfgWithVoice = poolOptions.voiceConfigResolver('test_sound');
            expect(cfgWithVoice).toEqual({ priority: 5 });

            const cfgWithoutVoice = poolOptions.voiceConfigResolver('sound_no_voice');
            expect(cfgWithoutVoice).toBeUndefined();
        });

        it('should instantiate SoundInstance via instanceFactory', () => {
            const soundPoolArguments = (SoundPoolManager as any).mock.calls[0];
            const instanceFactory = soundPoolArguments[0];

            const instance = instanceFactory('test_sound');
            expect(instance).toBeDefined();
        });

        it('should resolve bus ID and volume in CullingContext', () => {
            const cullingContext = (globalThis as any).__mockCullingContext;

            expect(cullingContext.resolveBusId('test_sound')).toBe('sfx');
            expect(cullingContext.resolveBusId('unknown')).toBeUndefined();

            const sfxBus = engine._debug.busSystem.getBus('sfx' as BusId);
            expect(sfxBus).toBeDefined();

            const originalLogicalGain = sfxBus!.logicalTargetGain;
            sfxBus!.logicalTargetGain = 0.5;

            const getCurrentGainSpy = vi
                .spyOn(engine._debug.busSystem, 'getCurrentRealGain')
                .mockImplementation(busId => (busId === 'sfx' ? 0.8 : 1));

            expect(cullingContext.getBusVolume('sfx')).toBe(0.8);
            expect(cullingContext.getBusVolume('ghost')).toBe(1);

            sfxBus!.logicalTargetGain = originalLogicalGain;
            getCurrentGainSpy.mockRestore();
        });

        it('should successfully initialize sidechains from config without errors', () => {
            const debugObject = engine._debug;
            const sfxSidechain = debugObject.busSystem.getSidechain('sfx');
            expect(sfxSidechain).toBeDefined();
            expect(sfxSidechain?.activeEnvelope).toBe(0);
        });

        it('should provide FiltersPlugin via pluginFactory when a bus needs a filter', async () => {
            vi.useFakeTimers();

            const createNodeSpy = vi.spyOn(FiltersPlugin, 'createNode').mockReturnValue({
                type: 'lowpass',
                frequency: { value: 1000 },
                Q: { value: 1 },
                connect: vi.fn(),
                disconnect: vi.fn()
            } as any);

            const filterEngine = new AudioEngine({
                manifest: {},
                soundMap: {},
                snapshots: {},
                events: {},
                buses: {
                    master: { gain: 1, filter: { type: 'lowpass', frequency: 1000 } }
                },
                banks: {}
            });

            const initPromise = filterEngine.init();

            await vi.advanceTimersByTimeAsync(50);
            await initPromise;

            expect(createNodeSpy).toHaveBeenCalled();

            createNodeSpy.mockRestore();
            vi.useRealTimers();
        });

        it('should pass recompute callback to MixerLayerStack which calls coordinator.recompute', async () => {
            const recomputeSpy = vi.spyOn(MixerCoordinator.prototype, 'recompute').mockResolvedValue(undefined);

            const layerEngine = new AudioEngine({
                manifest: {},
                soundMap: {},
                events: {},
                buses: { master: { gain: 1 } },
                snapshots: { ['snap1' as SnapshotId]: { buses: { ['master' as BusId]: { gain: 0.5 } } } },
                banks: {}
            });
            await layerEngine.init();

            layerEngine.mixer.addModifier('snap1', 'layer1');

            expect(recomputeSpy).toHaveBeenCalledWith({ duration: 500 });
            recomputeSpy.mockRestore();
        });
    });

    describe('Playback API Delegation', () => {
        it('should delegate play to AudioRouter and return the resulting ID(s)', () => {
            const result = engine.play('explosion', { volume: 0.5 });
            expect(playSpy).toHaveBeenCalledWith('explosion', { volume: 0.5 });
            expect(result).toBe(42);
        });

        it('should delegate stop to AudioRouter for single or multiple IDs', () => {
            engine.stop([1 as PlaybackId, 2 as PlaybackId]);
            expect(stopSpy).toHaveBeenCalledWith([1 as PlaybackId, 2 as PlaybackId]);
        });
    });

    describe('Event Orchestrator Delegation', () => {
        it('should warn and return early if postEvent is called before engine is initialized', () => {
            const uninitEngine = new AudioEngine({ buses: {}, soundMap: {}, snapshots: {}, events: {} } as any);
            const warnSpy = vi.spyOn(console, 'warn');

            uninitEngine.postEvent('Player_Jump');

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Cannot post event "Player_Jump": Engine is not initialized.')
            );
        });

        it('should delegate postEvent to AudioEventOrchestrator when initialized', () => {
            const orchestratorSpy = vi.spyOn(engine._debug.eventOrchestrator, 'postEvent').mockImplementation(() => {});

            engine.postEvent('Player_Jump');

            expect(orchestratorSpy).toHaveBeenCalledWith('Player_Jump');
            orchestratorSpy.mockRestore();
        });
    });

    describe('Playback Control (Pause/Resume)', () => {
        it('should delegate pause and resume calls to the router', () => {
            engine.pause('play_123');
            expect(pauseSpy).toHaveBeenCalledWith('play_123');

            engine.resume('play_456');
            expect(resumeSoundSpy).toHaveBeenCalledWith('play_456');
        });
    });

    describe('Spatial 3D API', () => {
        let setListenerPosSpy: any;
        let setListenerOriSpy: any;
        let setSoundPosSpy: any;

        beforeEach(() => {
            setListenerPosSpy = vi
                .spyOn(engine['_debug'].contextManager, 'setListenerPosition')
                .mockImplementation(() => {});
            setListenerOriSpy = vi
                .spyOn(engine['_debug'].contextManager, 'setListenerOrientation')
                .mockImplementation(() => {});

            setSoundPosSpy = vi
                .spyOn(engine['_debug'].router['soundController'] as any, 'setPosition')
                .mockImplementation(() => {});
        });

        describe('Listener Position & Orientation', () => {
            it('should delegate setListenerPosition to AudioContextManager', () => {
                engine.spatial.setListenerPosition(10, 20, 30);
                expect(setListenerPosSpy).toHaveBeenCalledTimes(1);
                expect(setListenerPosSpy).toHaveBeenCalledWith(10, 20, 30);
            });

            it('should delegate setListenerOrientation to AudioContextManager', () => {
                engine.spatial.setListenerOrientation({
                    fx: 0,
                    fy: 0,
                    fz: -1,
                    ux: 0,
                    uy: 1,
                    uz: 0
                });
                expect(setListenerOriSpy).toHaveBeenCalledTimes(1);
                expect(setListenerOriSpy).toHaveBeenCalledWith(0, 0, -1, 0, 1, 0);
            });
        });

        describe('Sound Position (PannerNode)', () => {
            it('should delegate setSoundPosition to SoundController for a single ID', () => {
                engine.spatial.setSoundPosition({
                    playbackId: 101 as PlaybackId,
                    x: 50,
                    y: 15,
                    z: -30
                });
                expect(setSoundPosSpy).toHaveBeenCalledTimes(1);
                expect(setSoundPosSpy).toHaveBeenCalledWith(101, 50, 15, -30);
            });

            it('should delegate setSoundPosition to SoundController for multiple IDs', () => {
                engine.spatial.setSoundPosition({
                    playbackId: [201 as PlaybackId, 202 as PlaybackId],
                    x: 10,
                    y: 20,
                    z: 30
                });
                expect(setSoundPosSpy).toHaveBeenCalledTimes(2);
                expect(setSoundPosSpy).toHaveBeenNthCalledWith(1, 201, 10, 20, 30);
                expect(setSoundPosSpy).toHaveBeenNthCalledWith(2, 202, 10, 20, 30);
            });
        });
    });

    describe('Spatial Audio Pipeline (Config -> Instance -> Facade)', () => {
        // oxlint-disable-next-line no-shadow
        let engine: AudioEngine;
        // oxlint-disable-next-line no-unused-vars
        let mock3DVoice: any;
        // oxlint-disable-next-line no-unused-vars
        let mock2DVoice: any;

        beforeEach(async () => {
            vi.clearAllMocks();

            const mockPannerNode = {
                positionX: { value: 0 },
                positionY: { value: 0 },
                positionZ: { value: 0 }
            };

            mock3DVoice = {
                position: { x: 0, y: 0, z: 0 },
                physicalInstance: { pannerNode: mockPannerNode }
            };

            mock2DVoice = {
                position: { x: 0, y: 0, z: 0 },
                physicalInstance: { pannerNode: null }
            };

            engine = new AudioEngine({
                manifest: {
                    ['bullet_flyby' as SoundId]: { url: 'audio/bullet.mp3' },
                    ['ui_click' as SoundId]: { url: 'audio/click.mp3' }
                },
                buses: { master: { gain: 1 } },
                snapshots: {},
                events: {},
                soundMap: {
                    ['bullet_flyby' as SoundId]: { busId: 'master', spatial: true },
                    ['ui_click' as SoundId]: { busId: 'master' }
                } as any,
                banks: {}
            });

            await engine.init();
        });

        it('should correctly pass spatial config from SoundMap to SoundInstance factory', () => {
            const soundPoolMockCalls = vi.mocked(SoundPoolManager).mock.calls;

            expect(soundPoolMockCalls.length).toBeGreaterThan(0);
            const instanceFactory = soundPoolMockCalls[0][0];

            instanceFactory('bullet_flyby' as SoundId);
            const bulletCall = vi
                .mocked(SoundInstance)
                .mock.calls.find((call: ConstructorParameters<typeof SoundInstance>) => call[0] === 'bullet_flyby');

            instanceFactory('ui_click' as SoundId);
            const clickCall = vi
                .mocked(SoundInstance)
                .mock.calls.find((call: ConstructorParameters<typeof SoundInstance>) => call[0] === 'ui_click');

            expect(bulletCall).toBeDefined();
            expect(bulletCall![5]).toEqual(
                expect.objectContaining({
                    spatial: true
                })
            );

            expect(clickCall).toBeDefined();
            expect(clickCall![5]!.spatial).toBeUndefined();
        });
    });

    it('should safely ignore bank load and unload if engine is not initialized', async () => {
        const uninitEngine = new AudioEngine({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });
        await expect(uninitEngine.banks.load('Bank_A')).resolves.not.toThrow();
        expect(() => {
            uninitEngine.banks.unload('Bank_A');
        }).not.toThrow();
    });

    it('should call resume on unlock()', async () => {
        (engine._debug.contextManager as any).resume = vi.fn().mockResolvedValue(undefined);
        const resumeSpy = vi.spyOn(engine._debug.contextManager, 'resume');
        await engine.unlock();
        expect(resumeSpy).toHaveBeenCalledTimes(1);
    });

    it('should call suspend on suspend()', async () => {
        (engine._debug.contextManager as any).suspend = vi.fn().mockResolvedValue(undefined);
        const suspendSpy = vi.spyOn(engine._debug.contextManager, 'suspend');
        await engine.suspend();
        expect(suspendSpy).toHaveBeenCalledTimes(1);
    });

    it('should safely instantiate reserved and unmapped sounds', async () => {
        const infra = await import('@infrastructure');
        vi.spyOn(infra.EngineTicker.prototype, 'start').mockImplementation(() => {});

        const testEngine = new AudioEngine({
            manifest: { ['ghost' as SoundId]: { url: 'ghost.mp3' } },
            soundMap: {},
            buses: {},
            snapshots: {},
            events: {},
            banks: {}
        });
        await testEngine.init();

        const poolCalls = vi.mocked(infra.SoundPoolManager).mock.calls;
        const instanceFactory = poolCalls.at(-1)![0];
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(instanceFactory('__RESERVED__' as SoundId)).toBeDefined();
        expect(() => instanceFactory('ghost' as SoundId)).not.toThrow();

        const bufferLoaderInstance = vi.mocked(infra.AudioBufferLoader).mock.results.at(-1)!.value;
        bufferLoaderInstance.getBuffer.mockReturnValueOnce(null);

        instanceFactory('ghost' as SoundId);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Buffer for "ghost" not found'));
        warnSpy.mockRestore();
    });

    it('should log initiation and completion messages', async () => {
        const infra = await import('@infrastructure');
        vi.spyOn(infra.EngineTicker.prototype, 'start').mockImplementation(() => {});
        const localLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        const testEngine = new AudioEngine({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });
        vi.spyOn(ConsistencyChecker, 'validate').mockReturnValue(true);
        await testEngine.init();
        await testEngine._hotReloadConfig({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });

        expect(localLogSpy).toHaveBeenCalledWith(expect.stringContaining('Initiating Hot Reload'));
        expect(localLogSpy).toHaveBeenCalledWith(expect.stringContaining('Hot Reload complete!'));
        localLogSpy.mockRestore();
    });

    it('should catch errors during apply phase and log gracefully', async () => {
        const infra = await import('@infrastructure');
        vi.spyOn(infra.EngineTicker.prototype, 'start').mockImplementation(() => {});
        const localErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const testEngine = new AudioEngine({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });
        vi.spyOn(ConsistencyChecker, 'validate').mockReturnValue(true);
        await testEngine.init();

        vi.spyOn(testEngine._debug.busSystem, 'updateConfig').mockRejectedValueOnce(new Error('Apply Fail'));

        await testEngine._hotReloadConfig({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });
        expect(localErrorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Hot Reload failed during apply phase'),
            expect.any(Error)
        );
        localErrorSpy.mockRestore();
    });

    it('should capture and handle OOM Eviction telemetry and logs correctly', async () => {
        const infra = await import('@infrastructure');
        vi.spyOn(infra.EngineTicker.prototype, 'start').mockImplementation(() => {});

        const testEngine = new AudioEngine({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });
        await testEngine.init();

        const dispatchSpy = vi.spyOn(infra.TelemetryDispatcher.prototype, 'dispatch');
        const localErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const bufferCalls = vi.mocked(infra.AudioBufferLoader).mock.calls;
        const bufferLoaderMockArgs = bufferCalls.at(-1)!;
        const onEvict = bufferLoaderMockArgs[4] as (url: string) => void;

        onEvict('audio/large.mp3');

        expect(localErrorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL OOM EVICTION'));
        expect(dispatchSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'CAUSE_CHAIN',
                initiator: { type: 'RAM_QUOTA_MANAGER' },
                result: { type: 'OOM_CRITICAL_EVICTION', targetUrl: 'audio/large.mp3' }
            })
        );

        expect(vi.mocked(ConsistencyChecker.validate).mock.calls[0][1]?.reporters).toHaveLength(2);
        localErrorSpy.mockRestore();
        dispatchSpy.mockRestore();
    });

    it('should initialize CommandReceiver in non-production environments and map debug calls', async () => {
        const infra = await import('@infrastructure');

        let capturedDebugPort: any = null;
        const origReceiver = infra.CommandReceiver;

        (infra as any).CommandReceiver = vi.fn().mockImplementation(function (this: any, w: any, d: any) {
            capturedDebugPort = d;
            return this;
        });

        const testEngine = new AudioEngine({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });
        await testEngine.init();

        expect(capturedDebugPort).not.toBeNull();
        expect(capturedDebugPort.stopAll).toBeDefined();

        expect(() => capturedDebugPort.stopAll()).not.toThrow();
        expect(() => capturedDebugPort.pauseAll()).not.toThrow();
        expect(() => capturedDebugPort.resumeAll()).not.toThrow();
        expect(() => capturedDebugPort.clearAllOverrides()).not.toThrow();
        expect(() => capturedDebugPort.fireEvent('test' as any)).not.toThrow();
        expect(() => capturedDebugPort.applySnapshot('test' as any, 500)).not.toThrow();
        expect(() => capturedDebugPort.setRtpcOverride('test' as any, 1, true)).not.toThrow();
        expect(() => capturedDebugPort.playLoop('test' as any, 'region')).not.toThrow();
        expect(() => capturedDebugPort.stopLoop('test' as any)).not.toThrow();
        expect(() => capturedDebugPort.transitionMusicTo('test' as any, 'region', 'trans', {})).not.toThrow();

        (infra as any).CommandReceiver = origReceiver;
    });

    it('should log the exact success message on successful init (kills line 671)', async () => {
        const logSpy = vi.spyOn(console, 'log');

        const freshEngine = new AudioEngine({
            manifest: {},
            buses: { master: { gain: 1 } },
            soundMap: {},
            snapshots: {},
            events: {},
            banks: {}
        });
        await freshEngine.init();

        expect(logSpy).toHaveBeenCalledWith('[AudioEngine] Successfully Initialized');
    });

    it('should validate the new config against the same reporters used at init time (kills line 737)', async () => {
        const testEngine = new AudioEngine({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });
        vi.spyOn(ConsistencyChecker, 'validate').mockReturnValue(true);
        await testEngine.init();

        const validateSpy = vi.mocked(ConsistencyChecker.validate);
        validateSpy.mockClear();

        await testEngine._hotReloadConfig({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });

        expect(validateSpy).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ reporters: expect.arrayContaining([expect.anything(), expect.anything()]) })
        );
    });

    it('should default the snapshotter voice limit to 128 when globalVoiceLimit is omitted', async () => {
        const noLimitEngine = new AudioEngine({
            manifest: {},
            buses: { master: { gain: 1 } },
            soundMap: {},
            snapshots: {},
            events: {},
            banks: {}
        });

        await noLimitEngine.init();

        const snapshotterArgs = (globalThis as any).__mockSnapshotterArgs;
        expect(snapshotterArgs.at(-1)).toBe(128);
    });

    it('should invoke busSystem.tickRTPC via the registered bus-system ticker task (kills line 560)', async () => {
        const infra = await import('@infrastructure');
        const addSpy = vi.spyOn(infra.EngineTicker.prototype, 'add');

        const testEngine = new AudioEngine({
            manifest: {},
            buses: { master: { gain: 1 } },
            soundMap: {},
            snapshots: {},
            events: {},
            banks: {}
        });
        await testEngine.init();

        const busSystemTask = addSpy.mock.calls.find(call => call[0] === 'bus-system')?.[2] as { tick: () => void };
        expect(busSystemTask).toBeDefined();

        const tickRTPCSpy = vi.spyOn(testEngine._debug.busSystem, 'tickRTPC');
        busSystemTask.tick();

        expect(tickRTPCSpy).toHaveBeenCalledWith(testEngine._debug.rtpcManager);

        addSpy.mockRestore();
        tickRTPCSpy.mockRestore();
    });

    it('should invoke instanceRTPCBinder.tickRTPC via the registered instance-rtpc ticker task (kills line 566)', async () => {
        const tickRTPCSpy = vi.spyOn(InstanceRTPCBinder.prototype, 'tickRTPC').mockImplementation(() => {});
        const infra = await import('@infrastructure');
        const addSpy = vi.spyOn(infra.EngineTicker.prototype, 'add');

        const testEngine = new AudioEngine({
            manifest: {},
            buses: { master: { gain: 1 } },
            soundMap: {},
            snapshots: {},
            events: {},
            banks: {}
        });
        await testEngine.init();

        const instanceRtpcTask = addSpy.mock.calls.find(call => call[0] === 'instance-rtpc')?.[2] as {
            tick: () => void;
        };
        expect(instanceRtpcTask).toBeDefined();

        instanceRtpcTask.tick();

        expect(tickRTPCSpy).toHaveBeenCalledTimes(1);

        addSpy.mockRestore();
        tickRTPCSpy.mockRestore();
    });

    describe('Music Conductor wiring', () => {
        it('should create, tick, and start the MusicConductor when musicFSM is configured', async () => {
            const startSpy = vi.spyOn(MusicConductor.prototype, 'start').mockImplementation(() => {});
            const initSpy = vi.spyOn(MusicConductor.prototype, 'init').mockImplementation(() => {});

            const musicEngine = new AudioEngine({
                manifest: {},
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {},
                events: {},
                banks: {},
                musicFSM: { states: {}, initial: 'idle' } as any
            });
            await musicEngine.init();

            expect(initSpy).toHaveBeenCalledWith(musicEngine.config.musicFSM);

            musicEngine.conductor.start();
            expect(startSpy).toHaveBeenCalledTimes(1);

            startSpy.mockRestore();
            initSpy.mockRestore();
        });

        it('should NOT wire a conductor ticker task when musicFSM is absent (kills line 598)', async () => {
            const noMusicEngine = new AudioEngine({
                manifest: {},
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {},
                events: {},
                banks: {}
            });
            const startSpy = vi.spyOn(MusicConductor.prototype, 'start').mockImplementation(() => {});

            await noMusicEngine.init();
            noMusicEngine.conductor.start();

            expect(startSpy).not.toHaveBeenCalled();
            startSpy.mockRestore();
        });
    });
});

describe('AudioEngine - HMR (_hotReloadConfig)', () => {
    // oxlint-disable-next-line no-unused-vars
    let logSpy: any;
    // oxlint-disable-next-line no-unused-vars
    let warnSpy: any;
    let errorSpy: any;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should abort if engine is not initialized or config is invalid', async () => {
        const engine = new AudioEngine({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });

        await engine._hotReloadConfig({} as any);
        expect(errorSpy).not.toHaveBeenCalled();

        vi.spyOn(ConsistencyChecker, 'validate').mockReturnValue(true);
        await engine.init();

        vi.spyOn(ConsistencyChecker, 'validate').mockReturnValueOnce(false);
        await engine._hotReloadConfig({} as any);

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Hot Reload aborted'));
    });

    it('should correctly orchestrate the update across all subsystems', async () => {
        const engine = new AudioEngine({
            manifest: {},
            banks: {},
            buses: {},
            soundMap: {},
            snapshots: {},
            events: {}
        });

        vi.spyOn(ConsistencyChecker, 'validate').mockReturnValue(true);
        await engine.init();

        const busSystem = engine._debug.busSystem;
        const snapshotManager = engine._debug.snapshotManager;
        const router = engine._debug.router;

        const updateConfigSpy = vi.spyOn(busSystem, 'updateConfig').mockResolvedValue(undefined);
        const updateSnapshotsSpy = vi.spyOn(snapshotManager, 'updateSnapshotsConfig').mockImplementation(() => {});
        const initRTPCSpy = vi.spyOn(engine as any, 'initRTPC').mockImplementation(() => {});

        const newConfig = {
            manifest: {},
            banks: {},
            buses: { sfx: {} },
            snapshots: { combat: {} },
            soundMap: { hit: {} },
            events: {},
            rtpcManifest: { hp: { defaultValue: 100 } }
        };

        await engine._hotReloadConfig(newConfig);

        expect(initRTPCSpy).toHaveBeenCalledWith(newConfig.rtpcManifest);
        expect(updateConfigSpy).toHaveBeenCalledWith(newConfig.buses);
        expect(updateSnapshotsSpy).toHaveBeenCalledWith(newConfig.snapshots);
        expect((router as any).soundMap).toBe(newConfig.soundMap);
        expect(engine.config).toEqual(newConfig);
    });
});
