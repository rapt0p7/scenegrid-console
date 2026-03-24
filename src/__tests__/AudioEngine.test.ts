import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
    SoundController,
    VoiceCullingSystem,
    SoundPoolManager,
    AudioBufferLoader,
    SoundInstance
} from '@webaudio-core';

import { AudioEngine } from '../AudioEngine';
import AudioRouter from '../AudioRouter';
import ConsistencyChecker from '../Core/ConsistencyChecker';
import AudioDebugger from '../Debug/AudioDebugger';

vi.mock('worker-timers', () => ({
    setInterval: vi.fn(),
    clearInterval: vi.fn()
}));

vi.mock('../Core/SidechainDucker', () => ({
    default: vi.fn().mockImplementation(function () {
        return { insertLookahead: vi.fn(), start: vi.fn(), activeEnvelope: 0 };
    })
}));
vi.mock('../Core/TinyLimiterNode', () => ({
    default: vi.fn().mockImplementation(function () {
        return {
            load: vi.fn().mockResolvedValue(true),
            inputNode: { connect: vi.fn() },
            outputNode: { connect: vi.fn() }
        };
    })
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

vi.mock('@webaudio-core', async importOriginal => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        AudioContextManager: vi.fn().mockImplementation(function () {
            const mockNode = {
                gain: createMockAudioParameter(),
                connect: vi.fn(),
                disconnect: vi.fn(),
                delayTime: createMockAudioParameter()
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
                    resume: vi.fn().mockResolvedValue(undefined),
                    suspend: vi.fn().mockResolvedValue(undefined)
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
            return { load: vi.fn().mockResolvedValue(new ArrayBuffer(8)) };
        }),
        SoundPoolManager: vi.fn().mockImplementation(function (factory, options) {
            (globalThis as any).__mockSoundPoolConfig = options;
            return { getVoice: vi.fn() };
        }),
        VoiceCullingSystem: vi.fn().mockImplementation(function (pool, options) {
            (globalThis as any).__mockCullingConfig = options;
            return { start: vi.fn(), stop: vi.fn() };
        })
    };
});

vi.mock('../Debug/AudioDebugger', () => {
    return {
        default: vi.fn().mockImplementation(function () {
            return { init: vi.fn() };
        })
    };
});

vi.mock('../Core/ConsistencyChecker', () => ({
    default: {
        validate: vi.fn().mockReturnValue(true)
    }
}));

describe('AudioEngine', () => {
    let engine: AudioEngine;
    let mockVoice: any;

    let playSpy: any;
    let stopSpy: any;
    let getLogicalVoiceSpy: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockListener.positionX.value = 0;
        mockListener.positionY.value = 0;
        mockListener.positionZ.value = 0;
        mockListener.forwardX.value = 0;
        mockListener.forwardY.value = 0;
        mockListener.forwardZ.value = 0;

        playSpy = vi.spyOn(AudioRouter.prototype, 'play').mockReturnValue(42);
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
                test_sound: { url: 'audio/test.mp3' }
            },
            buses: {
                master: { gain: 1 },
                sfx: { gain: 1, sidechain: { enabled: true } }
            },
            snapshots: {},
            soundMap: {
                test_sound: { busId: 'sfx', voice: { priority: 5 }, spatial: true },
                sound_no_voice: { busId: 'master' }
            },
            globalVoiceLimit: 32
        });

        await engine.init();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete (globalThis as any).__mockSoundPoolConfig;
        delete (globalThis as any).__mockSoundPoolFactory;
        delete (globalThis as any).__mockCullingConfig;
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

        it('should delegate mixer.push and mixer.pop to SnapshotManager', () => {
            expect(() => engine.mixer.push('pauseMenu', 'layer1', 10)).not.toThrow();
            expect(() => engine.mixer.pop('layer1')).not.toThrow();
        });

        it('should delegate music loops and transitions to SmartLoopManager', () => {
            expect(() => engine.music.playLoop('bgm', 'verse1')).not.toThrow();
            expect(() => engine.music.stopLoop('bgm')).not.toThrow();
            expect(() => engine.music.transitionTo({ soundId: 'bgm', targetRegion: 'chorus' })).not.toThrow();
        });

        it('should call resume on unlock()', async () => {
            await expect(engine.unlock()).resolves.not.toThrow();
        });

        it('should initialize AudioDebugger on showDebugUI', async () => {
            await engine.showDebugUI();
            expect(AudioDebugger).toHaveBeenCalledTimes(1);
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

        it('should resolve bus ID and volume in VoiceCullingSystem', () => {
            const cullingOptions = (globalThis as any).__mockCullingConfig;

            expect(cullingOptions.busIdResolver('test_sound')).toBe('sfx');
            expect(cullingOptions.busIdResolver('unknown')).toBeUndefined();

            const sfxBus = engine._debug.busSystem.getBus('sfx' as any);

            expect(sfxBus).toBeDefined();

            sfxBus!.logicalTargetGain = 0.8;
            sfxBus!.inputGainNode.gain.value = 0.5;

            expect(cullingOptions.busVolumeResolver('sfx')).toBe(0.8);
            expect(cullingOptions.busVolumeResolver('ghost')).toBe(1);
        });

        it('should successfully initialize sidechains from config without errors', () => {
            const debugObject = engine._debug;
            const sfxSidechain = debugObject.busSystem.getSidechain('sfx');
            expect(sfxSidechain).toBeDefined();
            expect(sfxSidechain?.activeEnvelope).toBe(0);
        });
    });

    describe('Playback API Delegation', () => {
        it('should delegate play to AudioRouter and return the resulting ID(s)', () => {
            const result = engine.play('explosion', { volume: 0.5 });
            expect(playSpy).toHaveBeenCalledWith('explosion', { volume: 0.5 });
            expect(result).toBe(42);
        });

        it('should delegate stop to AudioRouter for single or multiple IDs', () => {
            engine.stop([1, 2]);
            expect(stopSpy).toHaveBeenCalledWith([1, 2]);
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
                .spyOn(engine['_debug'].router['soundController'], 'setPosition')
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
                    playbackId: 101,
                    x: 50,
                    y: 15,
                    z: -30
                });
                expect(setSoundPosSpy).toHaveBeenCalledTimes(1);
                expect(setSoundPosSpy).toHaveBeenCalledWith(101, 50, 15, -30);
            });

            it('should delegate setSoundPosition to SoundController for multiple IDs', () => {
                engine.spatial.setSoundPosition({
                    playbackId: [201, 202],
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
        let engine: AudioEngine;
        let mock3DVoice: any;
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
                    bullet_flyby: { url: 'audio/bullet.mp3' },
                    ui_click: { url: 'audio/click.mp3' }
                },
                buses: { master: { gain: 1 } },
                snapshots: {},
                soundMap: {
                    bullet_flyby: { busId: 'master', spatial: true },
                    ui_click: { busId: 'master' }
                }
            });

            await engine.init();
        });

        it('should correctly pass spatial config from SoundMap to SoundInstance factory', () => {
            const soundPoolMockCalls = vi.mocked(SoundPoolManager).mock.calls;

            expect(soundPoolMockCalls.length).toBeGreaterThan(0);
            const instanceFactory = soundPoolMockCalls[0][0];

            instanceFactory('bullet_flyby');
            const bulletCall = vi.mocked(SoundInstance).mock.calls.find(call => call[0] === 'bullet_flyby');

            instanceFactory('ui_click');
            const clickCall = vi.mocked(SoundInstance).mock.calls.find(call => call[0] === 'ui_click');

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
