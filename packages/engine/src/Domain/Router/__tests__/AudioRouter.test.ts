// noinspection D

import type { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';
import type { Mocked } from 'vitest';

import { AnySoundConfig } from '@domain/Configuration/Ports/ISoundConfig';
import { ISwitchHistoryRegistry } from '@domain/Managers/Ports/ISwitchHistoryRegistry.js';
import AudioRouter from '@domain/Router/AudioRouter.js';
import { PlaybackId, SoundId, IPRNG, TimeMath, Seconds } from '@scene-grid/shared';
import { ContextTime, Milliseconds, SeededPRNG } from '@scene-grid/shared';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const testSoundMap: any = {
    'simple_sound': { busId: 'sfx' },
    'layer_sound': {
        isLayered: true,
        busId: 'music',
        layers: [
            { src: 'layer1.wav', volume: 0.8 },
            { src: 'layer2.wav', delay: 500 }
        ]
    },
    'container_sound': {
        isContainer: true,
        mode: 'random',
        sources: ['var1.wav', 'var2.wav'],
        variation: { pitchVar: 0.1 }
    },
    'switch_sound': {
        isSwitch: true,
        busId: 'sfx',
        switchGroup: 'surface',
        switches: {
            0: 'step_wood',
            1: 'step_stone'
        },
        defaultSwitch: 'step_default'
    },
    'step_wood': { busId: 'sfx' },
    'step_stone': { busId: 'sfx' },
    'step_default': { busId: 'sfx' },
    'var2.wav': { busId: 'sfx' },
    'circular_container': {
        isContainer: true,
        mode: 'sequence',
        sources: ['circular_container']
    },
    'container_to_layer': {
        isContainer: true,
        mode: 'sequence',
        sources: ['layer_sound']
    },
    'test_sound': { busId: 'sfx', voice: { priority: 5 } },
    'scatterer_sound': {
        isScatterer: true,
        sources: ['step_wood'],
        spawnRate: [1000 as Milliseconds, 2000 as Milliseconds],
        scatterDistance: [10, 30]
    }
};

describe('AudioRouter (Command Dispatcher)', () => {
    let mockController: Mocked<ISoundController>;
    let mockDuckingManager: Mocked<any>;
    let mockInstanceRTPCBinder: Mocked<InstanceRTPCBinder>;
    let mockContainerPolicy: any;
    let mockHistoryRegistry: any;
    let mockSwitchRegistry: Mocked<ISwitchHistoryRegistry>;
    let mockRtpcAdapter: Mocked<IRTPCAdapter>;
    let mockSwitchPolicy: any;
    let mockScattererOrchestrator: any;
    let mockTelemetry: Mocked<ITelemetryDispatcher>;
    let router: AudioRouter;
    let prng: IPRNG;
    let seed = 123456;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        prng = new SeededPRNG(seed);

        mockController = {
            play: vi.fn().mockReturnValue(1),
            stopById: vi.fn(),
            stopAll: vi.fn(),
            routeToBus: vi.fn(),
            pauseById: vi.fn(),
            pauseAll: vi.fn(),
            resumeById: vi.fn(),
            resumeAll: vi.fn(),
            getActivePlaybacks: vi.fn().mockReturnValue([]),
            getSoundId: vi.fn(),
            getPosition: vi.fn(),
            setPosition: vi.fn(),
            playVirtual: vi.fn(),
            getCurrentTime: vi.fn().mockReturnValue(0),
            crossfade: vi.fn()
        } as unknown as Mocked<ISoundController>;

        mockDuckingManager = { triggerDucking: vi.fn() };

        mockScattererOrchestrator = {
            start: vi.fn(),
            tick: vi.fn()
        };

        mockInstanceRTPCBinder = {
            bind: vi.fn(),
            tickRTPC: vi.fn()
        } as unknown as Mocked<InstanceRTPCBinder>;

        mockContainerPolicy = {
            evaluateNext: vi.fn().mockReturnValue({
                soundId: 'var2.wav',
                nextState: { lastPlayedIndex: 1 }
            })
        };

        mockHistoryRegistry = {
            getHistory: vi.fn().mockReturnValue({ lastPlayedIndex: -1 }),
            updateHistory: vi.fn()
        };

        mockSwitchRegistry = {
            getHistory: vi.fn().mockReturnValue(undefined),
            updateHistory: vi.fn(),
            clear: vi.fn(),
            setOverride: vi.fn(),
            resetOverrides: vi.fn(),
            getOverride: vi.fn()
        };

        mockRtpcAdapter = {
            getValue: vi.fn()
        } as unknown as Mocked<IRTPCAdapter>;

        mockSwitchPolicy = {
            evaluateNext: vi.fn().mockReturnValue({
                soundId: 'step_stone',
                nextState: { currentSwitchKey: 1 }
            })
        };

        mockTelemetry = {
            dispatch: vi.fn(),
            dispatchManifest: vi.fn()
        };

        router = new AudioRouter({
            soundController: mockController,
            duckingManager: mockDuckingManager,
            containerPolicy: mockContainerPolicy,
            historyRegistry: mockHistoryRegistry,
            soundMap: testSoundMap,
            rtpcAdapter: mockRtpcAdapter,
            instanceRTPCBinder: mockInstanceRTPCBinder,
            switchPolicy: mockSwitchPolicy,
            switchHistoryRegistry: mockSwitchRegistry,
            prng,
            telemetry: mockTelemetry
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should play a simple sound and apply config using PlaybackId', () => {
        const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');

        const result = router.play('simple_sound' as SoundId);

        expect(result).toBe(1);
        expect(mockController.play).toHaveBeenCalledWith('simple_sound', expect.any(Object));

        expect(applyConfigSpy).toHaveBeenCalledWith(1, testSoundMap['simple_sound']);
        expect(mockController.routeToBus).toHaveBeenCalledWith(1, 'sfx');
    });

    it('should handle layered sounds correctly and return array of IDs', () => {
        mockController.play.mockReturnValueOnce(1 as PlaybackId).mockReturnValueOnce(2 as PlaybackId);

        const result = router.play('layer_sound' as SoundId);

        expect(result).toEqual([1, 2]);
        expect(mockController.play).toHaveBeenCalledTimes(2);
    });

    it('should handle container sounds using Registry, Policy, and Recursion', () => {
        const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');

        const result = router.play('container_sound' as SoundId);

        expect(result).toBe(1);

        expect(mockHistoryRegistry.getHistory).toHaveBeenCalledWith('container_sound');

        expect(mockContainerPolicy.evaluateNext).toHaveBeenCalledWith(testSoundMap['container_sound'], {
            lastPlayedIndex: -1
        });

        expect(mockHistoryRegistry.updateHistory).toHaveBeenCalledWith('container_sound', { lastPlayedIndex: 1 });

        expect(mockController.play).toHaveBeenCalledWith('var2.wav', expect.any(Object));

        expect(applyConfigSpy).toHaveBeenCalledWith(1, testSoundMap['container_sound']);
    });

    it('should reject plain soundController.play if config is not found', () => {
        const result = router.play('unknown_sound' as SoundId, { rate: 1.5 });

        expect(result).toBe(null);
        expect(mockController.play).not.toHaveBeenCalled();
        expect(mockController.routeToBus).not.toHaveBeenCalled();
    });

    describe('Switch Sounds Edge Cases (handleSwitch)', () => {
        it('should resolve a switch sound based on the RTPC adapter and registry state', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');

            mockRtpcAdapter.getValue.mockReturnValue(1);
            mockSwitchRegistry.getHistory.mockReturnValue({ currentSwitchKey: 0 });
            mockSwitchPolicy.evaluateNext.mockReturnValue({
                soundId: 'step_stone',
                nextState: { currentSwitchKey: 1 }
            });

            const result = router.play('switch_sound' as SoundId);

            expect(mockRtpcAdapter.getValue).toHaveBeenCalledWith('surface');
            expect(mockSwitchRegistry.getHistory).toHaveBeenCalledWith('switch_sound');

            expect(mockSwitchPolicy.evaluateNext).toHaveBeenCalledWith(testSoundMap['switch_sound'], 1, {
                currentSwitchKey: 0
            });

            expect(mockSwitchRegistry.updateHistory).toHaveBeenCalledWith('switch_sound', { currentSwitchKey: 1 });

            expect(mockController.play).toHaveBeenCalledWith('step_stone', expect.any(Object));
            expect(applyConfigSpy).toHaveBeenCalledWith(1, testSoundMap['switch_sound']);
            expect(result).toBe(1);
        });

        it('should return null and warn if the switch policy resolves to nothing (no fallback)', () => {
            mockRtpcAdapter.getValue.mockReturnValue(99);
            mockSwitchPolicy.evaluateNext.mockReturnValue({
                soundId: null,
                nextState: { currentSwitchKey: null }
            });

            const result = router.play('switch_sound' as SoundId);

            expect(result).toBeNull();
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Switch Container "switch_sound" failed to resolve')
            );
            expect(mockController.play).not.toHaveBeenCalled();
            expect(mockSwitchRegistry.updateHistory).toHaveBeenCalledWith('switch_sound', { currentSwitchKey: null });
        });

        it('should apply config to all playbacks if switch resolves to an array (e.g. nested layered sound)', () => {
            const applySpy = vi.spyOn(router, 'applyConfigToPlayback');

            mockRtpcAdapter.getValue.mockReturnValue(0);

            mockSwitchPolicy.evaluateNext.mockReturnValue({
                soundId: 'layer_sound',
                nextState: { currentSwitchKey: 0 }
            });

            mockController.play.mockReturnValueOnce(100 as PlaybackId).mockReturnValueOnce(101 as PlaybackId);

            const result = router.play('switch_sound' as SoundId);

            expect(result).toEqual([100, 101]);
            expect(applySpy).toHaveBeenCalledWith(100, testSoundMap['switch_sound']);
            expect(applySpy).toHaveBeenCalledWith(101, testSoundMap['switch_sound']);
        });

        it('should return null if recursive router.play fails (playbackResult is null)', () => {
            mockRtpcAdapter.getValue.mockReturnValue(0);

            mockSwitchPolicy.evaluateNext.mockReturnValue({
                soundId: 'step_stone',
                nextState: { currentSwitchKey: 0 }
            });

            mockController.play.mockReturnValue(null);

            const result = router.play('switch_sound' as SoundId);

            expect(result).toBeNull();
            expect(mockTelemetry.dispatch).not.toHaveBeenCalled();
        });

        it('should bypass RTPC adapter and use override value when switch registry returns a localized override', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');
            mockSwitchRegistry.getOverride.mockReturnValue('metal');
            mockRtpcAdapter.getValue.mockReturnValue(1);

            mockSwitchRegistry.getHistory.mockReturnValue({ currentSwitchKey: 'wood' });
            mockSwitchPolicy.evaluateNext.mockReturnValue({
                soundId: 'step_stone',
                nextState: { currentSwitchKey: 'metal' }
            });

            mockController.play.mockReturnValueOnce(1 as PlaybackId);

            const result = router.play('switch_sound' as SoundId);

            expect(mockSwitchRegistry.getOverride).toHaveBeenCalledWith('switch_sound');
            expect(mockRtpcAdapter.getValue).not.toHaveBeenCalled();
            expect(mockSwitchPolicy.evaluateNext).toHaveBeenCalledWith(testSoundMap['switch_sound'], 'metal', {
                currentSwitchKey: 'wood'
            });

            expect(mockSwitchRegistry.updateHistory).toHaveBeenCalledWith('switch_sound', {
                currentSwitchKey: 'metal'
            });
            expect(mockController.play).toHaveBeenCalledWith('step_stone', expect.any(Object));
            expect(result).toBe(1);

            applyConfigSpy.mockRestore();
        });

        it('should fall back to RTPC adapter when switch registry returns undefined for override', () => {
            mockSwitchRegistry.getOverride.mockReturnValue(undefined);
            mockRtpcAdapter.getValue.mockReturnValue(1);
            mockSwitchRegistry.getHistory.mockReturnValue(undefined);
            mockSwitchPolicy.evaluateNext.mockReturnValue({
                soundId: 'step_grass_asset',
                nextState: { currentSwitchKey: 'grass' }
            });

            router.play('switch_sound' as SoundId);

            expect(mockSwitchRegistry.getOverride).toHaveBeenCalledWith('switch_sound');
            expect(mockRtpcAdapter.getValue).toHaveBeenCalledWith('surface');
            expect(mockSwitchPolicy.evaluateNext).toHaveBeenCalledWith(testSoundMap['switch_sound'], 1, undefined);
        });
    });

    describe('Recursive Container Resolutions', () => {
        it('should break out of infinite recursion if depth exceeds 10', () => {
            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: 'circular_container',
                nextState: { lastPlayedIndex: 0 }
            });

            const result = router.play('circular_container' as SoundId);

            expect(result).toBeNull();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Max recursion depth reached'));
        });

        it('should correctly apply container config to ALL PlaybackIds if a layer is resolved', () => {
            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: 'layer_sound',
                nextState: { lastPlayedIndex: 0 }
            });
            mockController.play.mockReturnValueOnce(10 as PlaybackId).mockReturnValueOnce(20 as PlaybackId);

            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');

            const result = router.play('container_to_layer' as SoundId);

            expect(result).toEqual([10, 20]);

            expect(applyConfigSpy).toHaveBeenCalledWith(10, testSoundMap['container_to_layer']);
            expect(applyConfigSpy).toHaveBeenCalledWith(20, testSoundMap['container_to_layer']);
        });
    });

    describe('Playback Control (stop)', () => {
        const MOCK_CURRENT_TIME = 10.0 as ContextTime;

        beforeEach(() => {
            mockController.getCurrentTime.mockReturnValue(MOCK_CURRENT_TIME);
        });

        it('should resolve active playbacks by string (soundId) and stop them via stopById', () => {
            mockController.getActivePlaybacks.mockReturnValue([10 as PlaybackId, 20 as PlaybackId]);
            mockController.getSoundId.mockImplementation(id => {
                if (id === 10 || id === 20) return 'loop_sound' as SoundId;
                return undefined;
            });

            router.stop('loop_sound' as SoundId, { fadeOut: 400 as Milliseconds });

            expect(mockController.stopById).toHaveBeenCalledTimes(2);
            expect(mockController.stopById).toHaveBeenNthCalledWith(1, 10, 10.4);
            expect(mockController.stopById).toHaveBeenNthCalledWith(2, 20, 10.4);
        });

        it('should delegate stop to SoundController by number (playbackId)', () => {
            router.stop(42 as PlaybackId, { fadeOut: 150 as Milliseconds });

            expect(mockController.stopById).toHaveBeenCalledWith(42, 10.15);
        });

        it('should delegate stop to SoundController by array of numbers (playbackIds)', () => {
            router.stop([10, 11, 12] as PlaybackId[], { fadeOut: 500 as Milliseconds });

            expect(mockController.stopById).toHaveBeenCalledTimes(3);
            expect(mockController.stopById).toHaveBeenNthCalledWith(1, 10, 10.5);
            expect(mockController.stopById).toHaveBeenNthCalledWith(3, 12, 10.5);
        });

        it('should spawn a tail and inherit spatial coordinates when stopping a sound with a tail config', () => {
            testSoundMap['loop_with_tail'] = { busId: 'sfx', tail: 'reverb_tail' };
            testSoundMap['reverb_tail'] = { busId: 'sfx' };

            mockController.getActivePlaybacks.mockReturnValue([99 as PlaybackId]);

            mockController.getSoundId.mockImplementation(id => {
                if (id === 99) return 'loop_with_tail' as SoundId;
                return undefined;
            });

            mockController.getPosition.mockReturnValue({ x: 10, y: 20, z: 30 });
            mockController.play.mockReturnValueOnce(88 as PlaybackId);

            router.stop(99 as PlaybackId, { allowTail: true, fadeOut: 1000 as Milliseconds });

            expect(mockController.getPosition).toHaveBeenCalledWith(99);
            expect(mockController.play).toHaveBeenCalledWith('reverb_tail', expect.any(Object));
            expect(mockController.setPosition).toHaveBeenCalledWith(88, 10, 20, 30);
            expect(mockController.stopById).toHaveBeenCalledWith(99, 11.0);
        });
    });

    describe('Playback Control (pause & resume)', () => {
        it('should delegate pause to SoundController by string (soundId)', () => {
            router.pause('bg_music' as SoundId);
            expect(mockController.pauseAll).toHaveBeenCalledWith('bg_music');
        });

        it('should delegate pause to SoundController by number (playbackId)', () => {
            router.pause(42 as PlaybackId);
            expect(mockController.pauseById).toHaveBeenCalledWith(42);
            expect(mockController.pauseAll).not.toHaveBeenCalled();
        });

        it('should delegate pause to SoundController by array of numbers (playbackIds)', () => {
            router.pause([10, 11, 12] as PlaybackId[]);
            expect(mockController.pauseById).toHaveBeenCalledTimes(3);
            expect(mockController.pauseById).toHaveBeenNthCalledWith(1, 10);
            expect(mockController.pauseById).toHaveBeenNthCalledWith(3, 12);
        });

        it('should delegate resume to SoundController by string (soundId)', () => {
            router.resume('bg_music' as SoundId);
            expect(mockController.resumeAll).toHaveBeenCalledWith('bg_music');
        });

        it('should delegate resume to SoundController by number (playbackId)', () => {
            router.resume(42 as PlaybackId);
            expect(mockController.resumeById).toHaveBeenCalledWith(42);
            expect(mockController.resumeAll).not.toHaveBeenCalled();
        });

        it('should delegate resume to SoundController by array of numbers (playbackIds)', () => {
            router.resume([10, 11, 12] as PlaybackId[]);
            expect(mockController.resumeById).toHaveBeenCalledTimes(3);
            expect(mockController.resumeById).toHaveBeenNthCalledWith(1, 10);
            expect(mockController.resumeById).toHaveBeenNthCalledWith(3, 12);
        });
    });

    describe('onRevive Hook Generation', () => {
        it('should pass an onRevive hook that correctly applies configuration using PlaybackId', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');

            let capturedOptions: any;
            mockController.play.mockImplementation((name: any, options: any) => {
                capturedOptions = options;
                return 99 as PlaybackId;
            });

            router.play('simple_sound' as SoundId);

            expect(capturedOptions.onRevive).toBeDefined();
            expect(typeof capturedOptions.onRevive).toBe('function');

            capturedOptions.onRevive(99);
            expect(applyConfigSpy).toHaveBeenCalledWith(99, testSoundMap['simple_sound']);
        });

        it('should invoke applyConfigToPlayback when onRevive is executed for layered sounds', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');
            let capturedOptions: any;
            mockController.play.mockImplementation((name, options) => {
                capturedOptions = options;
                return 100 as PlaybackId;
            });

            router.play('layer_sound' as SoundId);
            applyConfigSpy.mockClear();

            capturedOptions.onRevive(100);

            expect(applyConfigSpy).toHaveBeenCalledWith(100, testSoundMap['layer_sound']);
        });
    });

    describe('Playback Edge Cases (play method)', () => {
        it('should return null if soundController.play returns null for a standard sound', () => {
            mockController.play = vi.fn().mockReturnValue(null);
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');

            const result = router.play('simple_sound' as SoundId);

            expect(result).toBeNull();
            expect(mockController.play).toHaveBeenCalled();
            expect(applyConfigSpy).not.toHaveBeenCalled();
        });
    });

    describe('Container Sounds Edge Cases (handleContainer)', () => {
        it('should return null if recursive router.play fails for a container source', () => {
            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: 'unknown_sound',
                nextState: { lastPlayedIndex: 0 }
            });

            const result = router.play('container_sound' as SoundId);

            expect(result).toBeNull();
            expect(mockController.play).not.toHaveBeenCalled();
        });

        it('should return null and dispatch error if recursive router.play fails for a container source', () => {
            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: 'does_not_exist',
                nextState: { lastPlayedIndex: 0 }
            });

            const result = router.play('container_sound' as SoundId);

            expect(result).toBeNull();
            expect(mockController.play).not.toHaveBeenCalled();
        });

        it('should abort and dispatch telemetry if max recursion depth is reached', () => {
            const result = (router as any).handleContainer('container_sound', testSoundMap['container_sound'], {}, 11);

            expect(result).toBeNull();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Max recursion depth reached'));
            expect(mockTelemetry.dispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    result: expect.objectContaining({
                        type: 'BLOCKED',
                        reason: expect.stringContaining('Max recursion depth')
                    })
                })
            );
        });

        it('should apply config to all playbacks if container resolves to an array (e.g. nested layered sound)', () => {
            const applySpy = vi.spyOn(router, 'applyConfigToPlayback');

            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: 'layer_sound',
                nextState: { lastPlayedIndex: 0 }
            });

            mockController.play.mockReturnValueOnce(42 as PlaybackId).mockReturnValueOnce(43 as PlaybackId);

            const result = router.play('container_sound' as SoundId);

            expect(result).toEqual([42, 43]);

            expect(applySpy).toHaveBeenCalledWith(42, testSoundMap['container_sound']);
            expect(applySpy).toHaveBeenCalledWith(43, testSoundMap['container_sound']);
        });

        it('should return null and dispatch telemetry if container resolves to empty source (nextSource is null)', () => {
            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: null,
                nextState: { lastPlayedIndex: -1 }
            });

            const result = router.play('container_sound' as SoundId);

            expect(result).toBeNull();
            expect(mockTelemetry.dispatch).toHaveBeenCalledWith(
                expect.objectContaining({
                    result: expect.objectContaining({
                        type: 'BLOCKED',
                        reason: 'Container "container_sound" resolved to empty source.'
                    })
                })
            );
        });
    });

    describe('Layered Sounds Edge Cases (handleLayering)', () => {
        it('should skip a layer and continue if soundController.play returns null for that specific layer', () => {
            mockController.play = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(null);

            const result = router.play('layer_sound' as SoundId);

            expect(result).toEqual([10]);
            expect(mockController.play).toHaveBeenCalledTimes(2);
        });

        it('should pass a working onRevive hook to layered instances using PlaybackId', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback').mockImplementation(() => {});

            const capturedOptions: any[] = [];
            mockController.play = vi.fn().mockImplementation((name, options) => {
                capturedOptions.push(options);
                return 1 as PlaybackId;
            });

            router.play('layer_sound' as SoundId);

            const firstLayerOptions = capturedOptions[0];
            expect(typeof firstLayerOptions.onRevive).toBe('function');

            firstLayerOptions.onRevive(1);

            expect(applyConfigSpy).toHaveBeenCalledWith(1, testSoundMap['layer_sound']);
        });

        it('should return null if ALL layers fail to play', () => {
            mockController.play = vi.fn().mockReturnValue(null);
            const result = router.play('layer_sound' as SoundId);
            expect(result).toBeNull();
        });
    });

    describe('applyConfigToPlayback (Ducking & RTPC)', () => {
        it('should trigger ducking and bind RTPC if present in config', () => {
            const complexConfig: any = {
                busId: 'sfx',
                ducking: { target: 'music', intensity: 0.8 },
                rtpc: { gain: { gameParam: 'speed', curve: [] } }
            };

            const testId = 123 as PlaybackId;

            router.applyConfigToPlayback(testId, complexConfig);

            expect(mockDuckingManager.triggerDucking).toHaveBeenCalledWith(testId, 'music', 0.8);

            expect(mockInstanceRTPCBinder.bind).toHaveBeenCalledWith(testId, complexConfig.rtpc);
        });

        it('should use default ducking intensity (1) if not provided', () => {
            const defaultDuckingConfig: any = {
                busId: 'sfx',
                ducking: { target: 'ambient' }
            };

            router.applyConfigToPlayback(456 as PlaybackId, defaultDuckingConfig);

            expect(mockDuckingManager.triggerDucking).toHaveBeenCalledWith(456, 'ambient', 1);
        });
    });

    describe('applyVariation (Volume & Offset)', () => {
        it('should apply volumeVar and randomOffset variations correctly', () => {
            testSoundMap['var_sound'] = {
                busId: 'sfx',
                variation: { volumeVar: 0.2, randomOffset: 500 }
            };

            const expectedPrng = new SeededPRNG(seed);

            expectedPrng.nextRange(-0.2, 0.2);

            const expectedOffset = expectedPrng.nextRange(0, 500);

            router.play('var_sound' as SoundId, { volume: 0.5 });

            expect(mockController.play).toHaveBeenCalledWith(
                'var_sound',
                expect.objectContaining({
                    when: 0,
                    offset: expectedOffset / 1000
                })
            );
        });
    });

    describe('Scatterer Sounds Edge Cases (handleScatterer)', () => {
        it('should return null and warn if orchestrator is not set (Dependency Check)', () => {
            const result = router.play('scatterer_sound' as SoundId);

            expect(result).toBeNull();
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Cannot play scatterer scatterer_sound: Orchestrator not initialized')
            );
            expect(mockController.playVirtual).not.toHaveBeenCalled();
        });

        it('should create virtual voice and start orchestrator session', () => {
            router.setScattererOrchestrator(mockScattererOrchestrator);

            mockController.playVirtual.mockReturnValue(77 as PlaybackId);
            mockController.getCurrentTime.mockReturnValue(1.5 as ContextTime);

            const result = router.play('scatterer_sound' as SoundId);

            expect(result).toBe(77);
            expect(mockController.playVirtual).toHaveBeenCalledWith('scatterer_sound');

            expect(mockScattererOrchestrator.start).toHaveBeenCalledWith(77, testSoundMap['scatterer_sound'], 1.5);
        });
    });

    describe('AudioRouter.play recursion depth', () => {
        it('should block playback when recursion depth exceeds 10', () => {
            vi.spyOn(router, 'getSoundConfig').mockReturnValue({ isContainer: true } as any);
            vi.spyOn(router, 'handleContainer').mockImplementation((name, config, options, depth) => {
                return router.play(name, options, depth + 1);
            });
            const result = router.play('test-sound' as SoundId, {}, 11);

            expect(result).toBeNull();
            expect(mockController.play).not.toHaveBeenCalled();
        });

        it('should allow playback when recursion depth is exactly 10', () => {
            vi.spyOn(router, 'getSoundConfig').mockReturnValue({});
            const result = router.play('test-sound' as SoundId, {}, 10);

            expect(result).toBe(1);
            expect(mockController.play).toHaveBeenCalled();
        });
    });

    describe('performCrossfade', () => {
        it('should delegate crossfade operation to soundController with target parameters', () => {
            const outId = 1 as PlaybackId;
            const inId = 2 as PlaybackId;
            const duration = 1000 as Milliseconds;

            router.performCrossfade(outId, inId, duration);

            expect(mockController.crossfade).toHaveBeenCalledWith(outId, inId, duration);
        });
    });

    describe('applyConfigToPlayback edge cases', () => {
        it('should not route to bus when busId is undefined in config', () => {
            const playbackId = 10 as PlaybackId;
            const config: AnySoundConfig = {};

            router.applyConfigToPlayback(playbackId, config);

            expect(mockController.routeToBus).not.toHaveBeenCalled();
        });

        it('should not trigger ducking when ducking is null or ducking.target is undefined', () => {
            const playbackId = 10 as PlaybackId;
            const configNullDucking: any = { ducking: null };
            const configNoTarget: any = { ducking: { target: undefined } };

            expect(() => {
                router.applyConfigToPlayback(playbackId, configNullDucking);
            }).not.toThrow();
            expect(mockDuckingManager.triggerDucking).not.toHaveBeenCalled();

            router.applyConfigToPlayback(playbackId, configNoTarget);
            expect(mockDuckingManager.triggerDucking).not.toHaveBeenCalled();
        });

        it('should not bind RTPC when rtpc property is missing or falsy in config', () => {
            const playbackId = 10 as PlaybackId;
            const config: any = { rtpc: undefined };

            router.applyConfigToPlayback(playbackId, config);

            expect(mockInstanceRTPCBinder.bind).not.toHaveBeenCalled();
        });
    });

    describe('Telemetry Dispatching & Optional Chaining', () => {
        it('should handle missing telemetry dispatcher gracefully without throwing on error path', () => {
            const routerWithoutTelemetry = new AudioRouter({
                soundController: mockController,
                duckingManager: mockDuckingManager,
                containerPolicy: mockContainerPolicy,
                historyRegistry: mockHistoryRegistry,
                soundMap: testSoundMap,
                rtpcAdapter: mockRtpcAdapter,
                instanceRTPCBinder: mockInstanceRTPCBinder,
                switchPolicy: mockSwitchPolicy,
                switchHistoryRegistry: mockSwitchRegistry,
                prng,
                telemetry: undefined as any
            });

            expect(() => {
                routerWithoutTelemetry.play('unknown_sound' as SoundId);
            }).not.toThrow();
        });

        it('should dispatch cause chain telemetry with correct timestampMs and reason when sound config is missing', () => {
            mockController.getCurrentTime.mockReturnValue(2.5 as ContextTime);

            router.play('unknown_sound' as SoundId);

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'CAUSE_CHAIN',
                timestampMs: 2500,
                initiator: { type: 'API', method: 'router.play' },
                result: { type: 'BLOCKED', reason: 'Config not found for SoundId: unknown_sound' }
            });
        });

        it('should dispatch cause chain telemetry with correct payload when scatterer orchestrator is missing', () => {
            mockController.getCurrentTime.mockReturnValue(1.0 as ContextTime);

            router.play('scatterer_sound' as SoundId);

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'CAUSE_CHAIN',
                timestampMs: 1000,
                initiator: { type: 'API', method: 'router.handleScatterer' },
                result: { type: 'BLOCKED', reason: 'ScattererOrchestrator not initialized for: scatterer_sound' }
            });
        });

        it('should dispatch cause chain telemetry with correct payload when switch fails to resolve', () => {
            mockController.getCurrentTime.mockReturnValue(3.0 as ContextTime);
            mockRtpcAdapter.getValue.mockReturnValue(99);
            mockSwitchPolicy.evaluateNext.mockReturnValue({ soundId: null, nextState: {} });

            router.play('switch_sound' as SoundId);

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'CAUSE_CHAIN',
                timestampMs: 3000,
                initiator: { type: 'API', method: 'router.handleSwitch' },
                result: {
                    type: 'BLOCKED',
                    reason: 'Switch "switch_sound" failed to resolve. Group: "surface" = 99'
                }
            });
        });
    });

    describe('Playback Delay & Target Time Calculation', () => {
        it('should set when to 0 (immediate) when relative delay is 0, even if getCurrentTime is non-zero', () => {
            mockController.getCurrentTime.mockReturnValue(10.0 as ContextTime);

            router.play('simple_sound' as SoundId);

            expect(mockController.play).toHaveBeenCalledWith(
                'simple_sound',
                expect.objectContaining({
                    when: 0
                })
            );
        });

        it('should calculate absolute target time correctly when options.when is provided', () => {
            mockController.getCurrentTime.mockReturnValue(5.0 as ContextTime);

            router.play('simple_sound' as SoundId, { when: 3 as ContextTime });

            expect(mockController.play).toHaveBeenCalledWith(
                'simple_sound',
                expect.objectContaining({
                    when: TimeMath.castToContextTime(8.0 as Seconds)
                })
            );
        });

        it('should calculate layer delay and seek offset accurately in handleLayering', () => {
            testSoundMap['layered_delay_seek'] = {
                isLayered: true,
                layers: [{ src: 'layer1.wav', delay: 500, seek: 1000 as Milliseconds }]
            };
            mockController.getCurrentTime.mockReturnValue(10.0 as ContextTime);

            router.play('layered_delay_seek' as SoundId);

            expect(mockController.play).toHaveBeenCalledWith(
                'layer1.wav',
                expect.objectContaining({
                    when: TimeMath.castToContextTime(10.5 as Seconds),
                    offset: 1
                })
            );
        });
    });

    describe('Playback Control (stop) Edge Cases', () => {
        it('should default allowTail to true when stop options argument is omitted', () => {
            testSoundMap['sound_with_tail'] = { busId: 'sfx', tail: 'tail_sound' };
            testSoundMap['tail_sound'] = { busId: 'sfx' };
            mockController.getActivePlaybacks.mockReturnValue([50 as PlaybackId]);
            mockController.getSoundId.mockReturnValue('sound_with_tail' as SoundId);

            router.stop(50 as PlaybackId);

            expect(mockController.play).toHaveBeenCalledWith('tail_sound', expect.any(Object));
            expect(mockController.stopById).toHaveBeenCalledWith(50, undefined);
        });

        it('should stop playback directly without config/tail lookup if getSoundId returns undefined', () => {
            mockController.getActivePlaybacks.mockReturnValue([99 as PlaybackId]);
            mockController.getSoundId.mockReturnValue(undefined);

            router.stop(99 as PlaybackId);

            expect(mockController.stopById).toHaveBeenCalledWith(99, undefined);
        });

        it('should set position for all tail playbacks when tail sound resolves to an array', () => {
            testSoundMap['multi_tail_sound'] = { busId: 'sfx', tail: 'tail_layer' };
            testSoundMap['tail_layer'] = {
                isLayered: true,
                layers: [{ src: 't1.wav' }, { src: 't2.wav' }]
            };
            mockController.getActivePlaybacks.mockReturnValue([70 as PlaybackId]);
            mockController.getSoundId.mockReturnValue('multi_tail_sound' as SoundId);
            mockController.getPosition.mockReturnValue({ x: 1, y: 2, z: 3 });
            mockController.play.mockReturnValueOnce(101 as PlaybackId).mockReturnValueOnce(102 as PlaybackId);

            router.stop(70 as PlaybackId);

            expect(mockController.setPosition).toHaveBeenCalledTimes(2);
            expect(mockController.setPosition).toHaveBeenNthCalledWith(1, 101, 1, 2, 3);
            expect(mockController.setPosition).toHaveBeenNthCalledWith(2, 102, 1, 2, 3);
        });

        it('should not attempt to update position if getPosition returns undefined', () => {
            testSoundMap['sound_with_tail_nopos'] = { busId: 'sfx', tail: 'tail_sound' };
            mockController.getActivePlaybacks.mockReturnValue([80 as PlaybackId]);
            mockController.getSoundId.mockReturnValue('sound_with_tail_nopos' as SoundId);
            mockController.getPosition.mockReturnValue(undefined);

            expect(() => {
                router.stop(80 as PlaybackId);
            }).not.toThrow();
            expect(mockController.setPosition).not.toHaveBeenCalled();
        });

        it('should filter active playbacks strictly matching target soundId when stopping by SoundId', () => {
            mockController.getActivePlaybacks.mockReturnValue([10 as PlaybackId, 20 as PlaybackId]);
            mockController.getSoundId.mockImplementation(id => (id === 10 ? 'target_sound' : 'other_sound') as SoundId);

            router.stop('target_sound' as SoundId);

            expect(mockController.stopById).toHaveBeenCalledTimes(1);
            expect(mockController.stopById).toHaveBeenCalledWith(10, undefined);
        });
    });

    describe('Recursion Depth & Array Resolution', () => {
        it('should allow container resolution when container depth is 9 (child plays at depth 10)', () => {
            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: 'simple_sound',
                nextState: {}
            });

            const result = (router as any).handleContainer('container_sound', testSoundMap['container_sound'], {}, 9);

            expect(result).toBe(1);
            expect(mockController.play).toHaveBeenCalledWith('simple_sound', expect.any(Object));
        });

        it('should increment recursion depth and terminate when a switch container references itself recursively', () => {
            testSoundMap['recursive_switch'] = {
                isSwitch: true,
                switchGroup: 'surface'
            };
            mockRtpcAdapter.getValue.mockReturnValue(0);
            mockSwitchPolicy.evaluateNext.mockReturnValue({
                soundId: 'recursive_switch',
                nextState: {}
            });

            const result = router.play('recursive_switch' as SoundId);

            expect(result).toBeNull();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Max recursion depth reached'));
        });
    });

    describe('Sound Config Type Guard Flag Validation', () => {
        it('should play as standard sound when isContainer is explicitly false', () => {
            testSoundMap['false_container'] = { busId: 'sfx', isContainer: false };

            const result = router.play('false_container' as SoundId);

            expect(result).toBe(1);
            expect(mockController.play).toHaveBeenCalledWith('false_container', expect.any(Object));
            expect(mockContainerPolicy.evaluateNext).not.toHaveBeenCalled();
        });

        it('should play as standard sound when isLayered is explicitly false', () => {
            testSoundMap['false_layered'] = { busId: 'sfx', isLayered: false };

            const result = router.play('false_layered' as SoundId);

            expect(result).toBe(1);
            expect(mockController.play).toHaveBeenCalledWith('false_layered', expect.any(Object));
        });

        it('should play as standard sound when isSwitch is explicitly false', () => {
            testSoundMap['false_switch'] = { busId: 'sfx', isSwitch: false };

            const result = router.play('false_switch' as SoundId);

            expect(result).toBe(1);
            expect(mockController.play).toHaveBeenCalledWith('false_switch', expect.any(Object));
            expect(mockSwitchPolicy.evaluateNext).not.toHaveBeenCalled();
        });

        it('should play as standard sound when isScatterer is explicitly false', () => {
            testSoundMap['false_scatterer'] = { busId: 'sfx', isScatterer: false };

            const result = router.play('false_scatterer' as SoundId);

            expect(result).toBe(1);
            expect(mockController.play).toHaveBeenCalledWith('false_scatterer', expect.any(Object));
            expect(mockController.playVirtual).not.toHaveBeenCalled();
        });
    });

    describe('Telemetry Dispatching & Error Logging', () => {
        it('should not throw when telemetry is omitted and max recursion depth is reached in play', () => {
            const routerNoTelemetry = new AudioRouter({
                soundController: mockController,
                duckingManager: mockDuckingManager,
                containerPolicy: mockContainerPolicy,
                historyRegistry: mockHistoryRegistry,
                soundMap: testSoundMap,
                rtpcAdapter: mockRtpcAdapter,
                instanceRTPCBinder: mockInstanceRTPCBinder,
                switchPolicy: mockSwitchPolicy,
                switchHistoryRegistry: mockSwitchRegistry,
                prng,
                telemetry: undefined as any
            });

            expect(() => {
                routerNoTelemetry.play('simple_sound' as SoundId, {}, 11);
            }).not.toThrow();
        });

        it('should dispatch exact cause chain payload when max recursion depth is reached in play', () => {
            mockController.getCurrentTime.mockReturnValue(2.5 as ContextTime);

            router.play('simple_sound' as SoundId, {}, 11);

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'CAUSE_CHAIN',
                timestampMs: 2500,
                initiator: { type: 'API', method: 'router.play' },
                result: { type: 'BLOCKED', reason: 'Max recursion depth reached for SoundId: simple_sound' }
            });
        });

        it('should dispatch exact cause chain payload when max recursion depth is reached in handleContainer', () => {
            mockController.getCurrentTime.mockReturnValue(1.5 as ContextTime);

            (router as any).handleContainer('container_sound', testSoundMap['container_sound'], {}, 11);

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'CAUSE_CHAIN',
                timestampMs: 1500,
                initiator: { type: 'API', method: 'router.handleContainer' },
                result: { type: 'BLOCKED', reason: 'Max recursion depth reached for container: container_sound' }
            });
        });

        it('should dispatch exact cause chain payload when container resolves to an empty source', () => {
            mockController.getCurrentTime.mockReturnValue(3.0 as ContextTime);
            mockContainerPolicy.evaluateNext.mockReturnValue({ soundId: null, nextState: {} });

            router.play('container_sound' as SoundId);

            expect(mockTelemetry.dispatch).toHaveBeenCalledWith({
                type: 'CAUSE_CHAIN',
                timestampMs: 3000,
                initiator: { type: 'API', method: 'router.handleContainer' },
                result: { type: 'BLOCKED', reason: 'Container "container_sound" resolved to empty source.' }
            });
        });

        it('should log exact warning message when switch container fails to resolve', () => {
            mockRtpcAdapter.getValue.mockReturnValue(99);
            mockSwitchPolicy.evaluateNext.mockReturnValue({ soundId: null, nextState: {} });

            router.play('switch_sound' as SoundId);

            expect(console.warn).toHaveBeenCalledWith(
                '[AudioRouter] Switch Container "switch_sound" failed to resolve. ' +
                    'Group: "surface", Current Value: "99". ' +
                    'Check your SoundMap for missing keys or add a defaultSwitch.'
            );
        });
    });

    describe('Variation & Layering Delay Calculation', () => {
        it('should set when to 0 for layers without delay even when getCurrentTime is non-zero', () => {
            testSoundMap['layer_nodelay'] = {
                isLayered: true,
                layers: [{ src: 'layer1.wav' }]
            };
            mockController.getCurrentTime.mockReturnValue(10.0 as ContextTime);

            router.play('layer_nodelay' as SoundId);

            expect(mockController.play).toHaveBeenCalledWith(
                'layer1.wav',
                expect.objectContaining({
                    when: 0
                })
            );
        });
    });

    describe('Play Options Delay Calculation', () => {
        it('should apply delay from IPlayOptions when options.when is not provided', () => {
            router.play('simple_sound' as SoundId, { delay: 500 as Milliseconds });

            expect(mockController.play).toHaveBeenCalledWith(
                'simple_sound',
                expect.objectContaining({
                    when: TimeMath.castToContextTime(0.5 as Seconds)
                })
            );
        });
    });

    describe('Standard Play onRevive Callback', () => {
        it('should invoke applyConfigToPlayback when onRevive callback is executed', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');
            let capturedOptions: any;
            mockController.play.mockImplementation((name, options) => {
                capturedOptions = options;
                return 88 as PlaybackId;
            });

            router.play('simple_sound' as SoundId);

            expect(applyConfigSpy).toHaveBeenCalledWith(88, testSoundMap['simple_sound']);

            applyConfigSpy.mockClear();

            capturedOptions.onRevive(88);

            expect(applyConfigSpy).toHaveBeenCalledTimes(1);
            expect(applyConfigSpy).toHaveBeenCalledWith(88, testSoundMap['simple_sound']);
        });
    });

    describe('stop() with Unmapped Playback ID', () => {
        it('should stop playback directly and skip getSoundConfig when getSoundId returns undefined', () => {
            const getSoundConfigSpy = vi.spyOn(router, 'getSoundConfig');
            mockController.getActivePlaybacks.mockReturnValue([999 as PlaybackId]);
            mockController.getSoundId.mockReturnValue(undefined);

            router.stop(999 as PlaybackId);

            expect(mockController.stopById).toHaveBeenCalledWith(999, undefined);
            expect(getSoundConfigSpy).not.toHaveBeenCalled();
        });
    });

    describe('Loop Bounds in Array Processing', () => {
        it('should resolve active playbacks without accessing out-of-bounds index', () => {
            mockController.getActivePlaybacks.mockReturnValue([10 as PlaybackId, 20 as PlaybackId]);
            mockController.getSoundId.mockImplementation(id => {
                if (id === undefined) {
                    throw new Error('Out of bounds access with undefined playbackId!');
                }
                return 'simple_sound' as SoundId;
            });

            expect(() => {
                router.stop('simple_sound' as SoundId);
            }).not.toThrow();

            expect(mockController.getSoundId).toHaveBeenCalledTimes(4);
            expect(mockController.getSoundId).not.toHaveBeenCalledWith(undefined);
        });

        it('should apply config to container array results without out-of-bounds calls', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');
            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: 'layer_sound',
                nextState: {}
            });
            mockController.play.mockReturnValueOnce(100 as PlaybackId).mockReturnValueOnce(101 as PlaybackId);

            router.play('container_sound' as SoundId);

            expect(applyConfigSpy).toHaveBeenCalledTimes(4);
            expect(applyConfigSpy).not.toHaveBeenCalledWith(undefined, expect.anything());
        });

        it('should apply config to switch array results without out-of-bounds calls', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');
            mockRtpcAdapter.getValue.mockReturnValue(0);
            mockSwitchPolicy.evaluateNext.mockReturnValue({
                soundId: 'layer_sound',
                nextState: {}
            });
            mockController.play.mockReturnValueOnce(200 as PlaybackId).mockReturnValueOnce(201 as PlaybackId);

            router.play('switch_sound' as SoundId);

            expect(applyConfigSpy).toHaveBeenCalledTimes(4);
            expect(applyConfigSpy).not.toHaveBeenCalledWith(undefined, expect.anything());
        });
    });

    describe('Null Playback Handling in Container and Switch', () => {
        it('should return null and not invoke applyConfigToPlayback when container source fails to play', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');
            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: 'failing_source',
                nextState: {}
            });
            testSoundMap['failing_source'] = { busId: 'sfx' };
            mockController.play.mockReturnValue(null);

            const result = router.play('container_sound' as SoundId);

            expect(result).toBeNull();
            expect(applyConfigSpy).not.toHaveBeenCalled();
        });

        it('should return null and not invoke applyConfigToPlayback when switch source fails to play', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback');
            mockRtpcAdapter.getValue.mockReturnValue(0);
            mockSwitchPolicy.evaluateNext.mockReturnValue({
                soundId: 'failing_source',
                nextState: {}
            });
            testSoundMap['failing_source'] = { busId: 'sfx' };
            mockController.play.mockReturnValue(null);

            const result = router.play('switch_sound' as SoundId);

            expect(result).toBeNull();
            expect(applyConfigSpy).not.toHaveBeenCalled();
        });
    });
});
