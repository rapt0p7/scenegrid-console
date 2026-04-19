/* eslint-disable @typescript-eslint/naming-convention */
// noinspection D
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';
import AudioRouter from '@domain/Router/AudioRouter.js';

import type { PlaybackId, SoundId } from '@domain/Types/Branded.js';
import { type Mocked } from 'vitest';
import { ISoundController } from '@domain/Shared/Ports/ISoundController.js';

vi.mock('@domain/Managers/InstanceRTPCBinder.js', () => ({
    InstanceRTPCBinder: {
        bind: vi.fn()
    }
}));

const testSoundMap: any = {
    simple_sound: { busId: 'sfx' },
    layer_sound: {
        isLayered: true,
        busId: 'music',
        layers: [
            { src: 'layer1.wav', volume: 0.8 },
            { src: 'layer2.wav', delayMs: 500 }
        ]
    },
    container_sound: {
        isContainer: true,
        mode: 'random',
        sources: ['var1.wav', 'var2.wav'],
        variation: { pitchVar: 0.1 }
    },
    test_sound: { busId: 'sfx', voice: { priority: 5 } }
};

describe('AudioRouter (Command Dispatcher)', () => {
    let mockController: Mocked<ISoundController>;
    let mockBusSystem: any;
    let mockDuckingManager: Mocked<any>;
    let mockRtpcAdapter: Mocked<any>;
    let mockContainerPolicy: any;
    let mockHistoryRegistry: any;
    let router: AudioRouter;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockController = {
            play: vi.fn().mockReturnValue(1 as PlaybackId),
            stopById: vi.fn(),
            stopAll: vi.fn(),
            routeToBus: vi.fn()
        } as unknown as Mocked<ISoundController>;

        mockBusSystem = {};
        mockDuckingManager = { triggerDucking: vi.fn() };
        mockRtpcAdapter = {};

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

        router = new AudioRouter({
            soundController: mockController,
            busSystem: mockBusSystem,
            rtpcManager: mockRtpcAdapter,
            duckingManager: mockDuckingManager,
            containerPolicy: mockContainerPolicy,
            historyRegistry: mockHistoryRegistry,
            soundMap: testSoundMap
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

    it('should handle container sounds using Registry and Policy (CQS pipeline)', () => {
        const result = router.play('container_sound' as SoundId);

        expect(result).toBe(1);

        expect(mockHistoryRegistry.getHistory).toHaveBeenCalledWith('container_sound');

        expect(mockContainerPolicy.evaluateNext).toHaveBeenCalledWith(testSoundMap['container_sound'], {
            lastPlayedIndex: -1
        });

        expect(mockHistoryRegistry.updateHistory).toHaveBeenCalledWith('container_sound', { lastPlayedIndex: 1 });

        expect(mockController.play).toHaveBeenCalledWith('var2.wav', expect.any(Object));
    });

    it('should reject plain soundController.play if config is not found', () => {
        const result = router.play('unknown_sound' as SoundId, { rate: 1.5 });

        expect(result).toBe(null);
        expect(mockController.play).not.toHaveBeenCalled();
        expect(mockController.routeToBus).not.toHaveBeenCalled();
    });

    describe('Playback Control (stop)', () => {
        it('should delegate stop to SoundController by string (soundId)', () => {
            router.stop('bg_music' as SoundId);
            expect(mockController.stopAll).toHaveBeenCalledWith('bg_music');
        });

        it('should delegate stop to SoundController by number (playbackId)', () => {
            router.stop(42 as PlaybackId);
            expect(mockController.stopById).toHaveBeenCalledWith(42);
            expect(mockController.stopAll).not.toHaveBeenCalled();
        });

        it('should delegate stop to SoundController by array of numbers (playbackIds)', () => {
            router.stop([10, 11, 12] as PlaybackId[]);
            expect(mockController.stopById).toHaveBeenCalledTimes(3);
            expect(mockController.stopById).toHaveBeenNthCalledWith(1, 10);
            expect(mockController.stopById).toHaveBeenNthCalledWith(3, 12);
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
        it('should return null if soundController.play fails for a container source', () => {
            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: 'some_internal_sound',
                nextState: { lastPlayedIndex: 0 }
            });
            mockController.play = vi.fn().mockReturnValue(null);

            const result = router.play('container_sound' as SoundId);

            expect(result).toBeNull();
            expect(mockController.play).toHaveBeenCalledWith('some_internal_sound', expect.any(Object));
        });

        it('should pass a working onRevive hook to the container instance using PlaybackId', () => {
            mockContainerPolicy.evaluateNext.mockReturnValue({
                soundId: 'some_internal_sound',
                nextState: { lastPlayedIndex: 0 }
            });
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToPlayback').mockImplementation(() => {});

            let capturedOptions: any;
            mockController.play = vi.fn().mockImplementation((name, options) => {
                capturedOptions = options;
                return 99 as PlaybackId;
            });

            router.play('container_sound' as SoundId);

            expect(typeof capturedOptions.onRevive).toBe('function');

            capturedOptions.onRevive(99 as PlaybackId);

            expect(applyConfigSpy).toHaveBeenCalledWith(99, testSoundMap['container_sound']);
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

            expect(InstanceRTPCBinder.bind).toHaveBeenCalledWith(
                testId,
                complexConfig.rtpc,
                mockRtpcAdapter,
                mockController
            );
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

            const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(1);

            router.play('var_sound' as SoundId, { volume: 0.5 });

            expect(mathRandomSpy).toHaveBeenCalled();
            expect(mockController.play).toHaveBeenCalledWith(
                'var_sound',
                expect.objectContaining({
                    when: 500 / 1000,
                    offset: 500 / 1000
                })
            );

            mathRandomSpy.mockRestore();
        });
    });
});
