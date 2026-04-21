// oxlint-disable unicorn/no-useless-undefined
// noinspection D

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AudioEngine } from '@application/AudioEngine.js';
import MixerCoordinator from '@domain/Mixer/MixerCoordinator.js';
import { PRIORITY } from '@domain/Mixer/MixerLayer.js';
import AudioRouter from '@domain/Router/AudioRouter.js';
import ConsistencyChecker from '@domain/Validation/ConsistencyChecker.js';
import {
    SoundController,
    SoundPoolManager,
    SoundInstance,
    AudioContextManager,
    FiltersPlugin,
    AudioDebugger
} from '@infrastructure';
import RTPCManager from '@kernel/RTPC/RTPCManager.js';

import type { BusId, PlaybackId, RegionId, SnapshotId, SoundId } from '@domain/Types/Branded.js';

vi.mock('worker-timers', () => ({
    setInterval: vi.fn(),
    clearInterval: vi.fn()
}));

vi.mock('standardized-audio-context', () => ({
    AudioWorkletNode: vi.fn().mockImplementation(function () {
        return { port: { onmessage: null }, connect: vi.fn() };
    })
}));

const createMockAudioParameter = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn()
});

// eslint-disable-next-line @typescript-eslint/naming-convention
const mockListener = {
    positionX: createMockAudioParameter(),
    positionY: createMockAudioParameter(),
    positionZ: createMockAudioParameter(),
    forwardX: createMockAudioParameter(),
    forwardY: createMockAudioParameter(),
    forwardZ: createMockAudioParameter(),
    upX: createMockAudioParameter(),
    upY: createMockAudioParameter(),
    upZ: createMockAudioParameter(),
    setPosition: vi.fn(),
    setOrientation: vi.fn()
};

vi.mock('@domain/Culling/VoiceCullingArbiter.js', () => ({
    VoiceCullingArbiter: vi.fn().mockImplementation(function () {
        return { evaluate: vi.fn().mockReturnValue({ toVirtualize: [], toDevirtualize: [] }) };
    })
}));

vi.mock('@infrastructure', async importOriginal => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        AudioContextManager: vi.fn().mockImplementation(function () {
            const mockNode = {
                gain: createMockAudioParameter(),
                connect: vi.fn(),
                disconnect: vi.fn(),
                delayTime: createMockAudioParameter(),
                setGainImmediate: vi.fn(),
                safeReplaceFilter: vi.fn()
            };
            const pannerMock = {
                panningModel: '',
                distanceModel: '',
                refDistance: 0,
                maxDistance: 0,
                rolloffFactor: 0,
                positionX: { value: 100 },
                positionY: { value: 100 },
                positionZ: { value: 100 }
            };
            return {
                context: {
                    listener: mockListener,
                    createGain: vi.fn().mockReturnValue(mockNode),
                    createDynamicsCompressor: vi.fn().mockReturnValue({
                        threshold: createMockAudioParameter(),
                        knee: createMockAudioParameter(),
                        ratio: createMockAudioParameter(),
                        attack: createMockAudioParameter(),
                        release: createMockAudioParameter(),
                        connect: vi.fn(),
                        disconnect: vi.fn()
                    }),
                    createPanner: vi.fn().mockReturnValue(pannerMock),
                    createDelay: vi.fn().mockReturnValue(mockNode),
                    createBiquadFilter: vi.fn().mockReturnValue({
                        type: '',
                        frequency: createMockAudioParameter(),
                        Q: createMockAudioParameter(),
                        gain: createMockAudioParameter(),
                        connect: vi.fn(),
                        disconnect: vi.fn()
                    }),
                    createBufferSource: vi.fn().mockReturnValue({
                        connect: vi.fn(),
                        start: vi.fn(),
                        stop: vi.fn(),
                        playbackRate: createMockAudioParameter()
                    }),
                    currentTime: 0,
                    state: 'running',
                    sampleRate: 44_100,
                    resume: vi.fn().mockResolvedValue(undefined),
                    suspend: vi.fn().mockResolvedValue(undefined),
                    addEventListener: vi.fn()
                },
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
                load: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
                loadBatch: vi.fn().mockImplementation(async (urls, onProgress, onError) => {
                    const results: any = {};
                    let loaded = 0;
                    const total = Object.keys(urls).length;
                    for (const [key, url] of Object.entries(urls as Record<string, string>)) {
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
                globalVoiceLimit: 32
            };
        }),
        // eslint-disable-next-line max-params
        CullingRunner: vi.fn().mockImplementation(function (arbiter, controller, contextProvider) {
            (globalThis as any).__mockCullingContext = contextProvider;
            return { start: vi.fn(), stop: vi.fn() };
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
        })
    };
});

vi.mock('@infrastructure/debug/AudioDebugger.js', () => {
    return {
        default: vi.fn().mockImplementation(function () {
            return { init: vi.fn() };
        })
    };
});

vi.mock('@domain/Validation/ConsistencyChecker.js', () => ({
    default: {
        validate: vi.fn().mockReturnValue(true)
    }
}));

describe('AudioEngine', () => {
    let engine: AudioEngine;
    let mockVoice: any;

    let playSpy: any;
    let stopSpy: any;
    // oxlint-disable-next-line no-unused-vars
    let getLogicalVoiceSpy: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        mockListener.positionX.value = 0;
        mockListener.positionY.value = 0;
        mockListener.positionZ.value = 0;
        mockListener.forwardX.value = 0;
        mockListener.forwardY.value = 0;
        mockListener.forwardZ.value = 0;

        playSpy = vi.spyOn(AudioRouter.prototype, 'play').mockReturnValue(42 as PlaybackId);
        stopSpy = vi.spyOn(AudioRouter.prototype, 'stop').mockImplementation(() => {});

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
                ['test_sound' as SoundId]: { url: 'audio/test.mp3' }
            },
            buses: {
                master: { gain: 1 },
                sfx: { gain: 1, sidechain: { enabled: true } }
            },
            snapshots: {},
            soundMap: {
                ['test_sound' as SoundId]: { busId: 'sfx', voice: { priority: 5 }, spatial: true },
                ['sound_no_voice' as SoundId]: { busId: 'master' }
            } as any,
            globalVoiceLimit: 32
        });

        await engine.init();
    });

    afterEach(() => {
        vi.restoreAllMocks();
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
            const badEngine = new AudioEngine({ manifest: {}, buses: {}, snapshots: {}, soundMap: {} });
            await badEngine.init();
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('initialized with errors'));
        });

        it('should emit engine:error and exit early if strict validation fails', async () => {
            (ConsistencyChecker.validate as any).mockReturnValueOnce(false);

            const badEngine = new AudioEngine({ manifest: {}, buses: {}, snapshots: {}, soundMap: {} });
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
                rtpcManifest: {
                    health: { attackMs: 100, releaseMs: 200, defaultValue: 100 },
                    speed: { attackMs: 50 }
                }
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

        it('should emit load:start, load:progress, and load:complete during init', async () => {
            const freshEngine = new AudioEngine({
                manifest: {
                    ['sound1' as SoundId]: { url: 'audio/1.mp3' },
                    ['sound2' as SoundId]: { url: 'audio/2.mp3' }
                },
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {}
            });

            const startSpy = vi.fn();
            const progressSpy = vi.fn();
            const completeSpy = vi.fn();

            freshEngine.events.on('load:start', startSpy);
            freshEngine.events.on('load:progress', progressSpy);
            freshEngine.events.on('load:complete', completeSpy);

            await freshEngine.init();

            expect(startSpy).toHaveBeenCalledWith({ totalItems: 2 });
            expect(progressSpy).toHaveBeenCalledTimes(2);
            expect(progressSpy).toHaveBeenLastCalledWith(expect.objectContaining({ progress: 1, loadedItems: 2 }));
            expect(completeSpy).toHaveBeenCalledWith(expect.objectContaining({ failedItems: [] }));
        });

        it('should emit load:complete immediately if manifest is empty', async () => {
            const emptyEngine = new AudioEngine({
                manifest: {},
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {}
            });

            const completeSpy = vi.fn();
            emptyEngine.events.on('load:complete', completeSpy);

            await emptyEngine.init();

            expect(completeSpy).toHaveBeenCalledWith({ failedItems: [], durationMs: 0 });
        });

        it('should emit engine:error for failed files and include them in load:complete', async () => {
            const errorEngine = new AudioEngine({
                manifest: {
                    ['good' as SoundId]: { url: 'audio/good.mp3' },
                    ['bad' as SoundId]: { url: 'audio/fail.mp3' }
                },
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {}
            });

            const errorSpy = vi.fn();
            const completeSpy = vi.fn();
            errorEngine.events.on('engine:error', errorSpy);
            errorEngine.events.on('load:complete', completeSpy);

            await errorEngine.init();

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

        it('should emit state:suspended and state:resumed when context state changes', async () => {
            const freshEngine = new AudioEngine({
                manifest: {},
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {}
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
            } as any);

            const brokenEngine = new AudioEngine({
                manifest: {},
                buses: { master: { gain: 1 } },
                soundMap: {},
                snapshots: {}
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
                engine.music.transitionTo({ soundId: 'bgm' as SoundId, targetRegion: 'chorus' as RegionId });
            }).not.toThrow();
        });

        it('should call resume on unlock()', async () => {
            await expect(engine.unlock()).resolves.not.toThrow();
        });

        it('should initialize AudioDebugger on showDebugUI', async () => {
            await engine.showDebugUI();
            expect(AudioDebugger).toHaveBeenCalledTimes(1);
        });

        it('should delegate mixer.setState to SnapshotManager with scene_main and BASE priority', () => {
            const debugObject = engine._debug;
            const activateSpy = vi.spyOn(debugObject.snapshotManager, 'activateSnapshot').mockImplementation(() => {});

            engine.mixer.setState('main_menu');

            expect(activateSpy).toHaveBeenCalledWith('main_menu', 'scene_main', PRIORITY.BASE);
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
                buses: {
                    master: { gain: 1, filter: { type: 'lowpass', frequency: 1000 } }
                }
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
                buses: { master: { gain: 1 } },
                snapshots: { ['snap1' as SnapshotId]: { buses: { ['master' as BusId]: { gain: 0.5 } } } }
            });
            await layerEngine.init();

            layerEngine.mixer.addModifier('snap1', 'layer1');

            expect(recomputeSpy).toHaveBeenCalledWith({ durationMs: 500 });
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
                soundMap: {
                    ['bullet_flyby' as SoundId]: { busId: 'master', spatial: true },
                    ['ui_click' as SoundId]: { busId: 'master' }
                } as any
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
});
