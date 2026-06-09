/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import AudioRouter from '@domain/Router/AudioRouter.js';
import { SeededPRNG } from '@scene-grid/shared';
import type { PlaybackId, SoundId, IPRNG } from '@scene-grid/shared';
import type { Mocked } from 'vitest';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import { ISwitchHistoryRegistry } from '@domain/Managers/Ports/ISwitchHistoryRegistry.js';
import type { ITelemetryDispatcher } from '@domain/Shared/Ports/ITelemetryDispatcher.js';

const testSoundMap: any = {
    'simple_sound': { busId: 'sfx' },
    'layer_sound': {
        isLayered: true,
        busId: 'music',
        layers: [
            { src: 'layer1.wav', volume: 0.8 },
            { src: 'layer2.wav', delayMs: 500 }
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
        spawnRateMs: [1000, 2000],
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
            play: vi.fn().mockReturnValue(1 as PlaybackId),
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
            getCurrentTime: vi.fn().mockReturnValue(0)
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
            // oxlint-disable-next-line unicorn/no-useless-undefined
            getHistory: vi.fn().mockReturnValue(undefined),
            updateHistory: vi.fn(),
            clear: vi.fn()
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
            dispatch: vi.fn()
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
        it('should resolve active playbacks by string (soundId) and stop them via stopById', () => {
            mockController.getActivePlaybacks.mockReturnValue([10 as PlaybackId, 20 as PlaybackId]);
            mockController.getSoundId.mockImplementation(id => {
                if (id === 10 || id === 20) return 'loop_sound' as SoundId;
                // oxlint-disable-next-line unicorn/no-useless-undefined
                return undefined;
            });

            router.stop('loop_sound' as SoundId, { fadeOutMs: 400 });

            expect(mockController.stopById).toHaveBeenCalledTimes(2);
            expect(mockController.stopById).toHaveBeenNthCalledWith(1, 10, 400);
            expect(mockController.stopById).toHaveBeenNthCalledWith(2, 20, 400);
        });

        it('should delegate stop to SoundController by number (playbackId)', () => {
            router.stop(42 as PlaybackId, { fadeOutMs: 150 });
            expect(mockController.stopById).toHaveBeenCalledWith(42, 150);
        });

        it('should delegate stop to SoundController by array of numbers (playbackIds)', () => {
            router.stop([10, 11, 12] as PlaybackId[], { fadeOutMs: 500 });
            expect(mockController.stopById).toHaveBeenCalledTimes(3);
            expect(mockController.stopById).toHaveBeenNthCalledWith(1, 10, 500);
            expect(mockController.stopById).toHaveBeenNthCalledWith(3, 12, 500);
        });
        it('should spawn a tail and inherit spatial coordinates when stopping a sound with a tail config', () => {
            testSoundMap['loop_with_tail'] = { busId: 'sfx', tail: 'reverb_tail' };
            testSoundMap['reverb_tail'] = { busId: 'sfx' };

            mockController.getActivePlaybacks.mockReturnValue([99 as PlaybackId]);

            mockController.getSoundId.mockImplementation(id => {
                if (id === 99) return 'loop_with_tail' as SoundId;
                // oxlint-disable-next-line unicorn/no-useless-undefined
                return undefined;
            });

            mockController.getPosition.mockReturnValue({ x: 10, y: 20, z: 30 });

            mockController.play.mockReturnValueOnce(88 as PlaybackId);

            router.stop(99 as PlaybackId, { allowTail: true, fadeOutMs: 1000 });

            expect(mockController.getPosition).toHaveBeenCalledWith(99);
            expect(mockController.play).toHaveBeenCalledWith('reverb_tail', expect.any(Object));
            expect(mockController.setPosition).toHaveBeenCalledWith(88, 10, 20, 30);
            expect(mockController.stopById).toHaveBeenCalledWith(99, 1000);
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

            capturedOptions.onRevive(99 as PlaybackId);
            expect(applyConfigSpy).toHaveBeenCalledWith(99, testSoundMap['simple_sound']);
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
    });

    describe('Layered Sounds Edge Cases (handleLayering)', () => {
        it('should skip a layer and continue if soundController.play returns null for that specific layer', () => {
            mockController.play = vi
                .fn()
                .mockReturnValueOnce(10 as PlaybackId)
                .mockReturnValueOnce(null);

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

            firstLayerOptions.onRevive(1 as PlaybackId);

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
            mockController.getCurrentTime.mockReturnValue(1.5);

            const result = router.play('scatterer_sound' as SoundId);

            expect(result).toBe(77);
            expect(mockController.playVirtual).toHaveBeenCalledWith('scatterer_sound');

            expect(mockScattererOrchestrator.start).toHaveBeenCalledWith(77, testSoundMap['scatterer_sound'], 1500);
        });
    });
});
