import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';

import AudioRouter from '../AudioRouter.js';

vi.mock('@domain/Managers/InstanceRTPCBinder.js', () => ({
    InstanceRTPCBinder: {
        bind: vi.fn()
    }
}));

vi.mock('../config/SoundMap', () => ({
    default: {
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
        }
    }
}));

describe('AudioRouter', () => {
    let mockController: any;
    let mockBusSystem: any;
    let mockDuckingManager: any;
    let mockRtpcManager: any;
    let mockContainerManager: any;
    let mockInstance: any;
    let router: AudioRouter;

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

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});

        mockInstance = { instanceGain: {} };

        mockController = {
            play: vi.fn().mockReturnValue({ playbackId: 1, instance: mockInstance }),
            stopById: vi.fn(),
            stopAll: vi.fn()
        };

        mockBusSystem = { routeInstance: vi.fn() };
        mockDuckingManager = { triggerDucking: vi.fn() };
        mockRtpcManager = {};
        mockContainerManager = {
            getNextSource: vi.fn().mockReturnValue('var2.wav')
        };

        router = new AudioRouter({
            soundController: mockController,
            busSystem: mockBusSystem,
            rtpcManager: mockRtpcManager,
            duckingManager: mockDuckingManager,
            containerManager: mockContainerManager,
            soundMap: testSoundMap
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should play a simple sound and apply config', () => {
        const applyConfigSpy = vi.spyOn(router, 'applyConfigToInstance');

        const result = router.play('simple_sound');

        expect(result).toBe(1);
        expect(mockController.play).toHaveBeenCalledWith('simple_sound', expect.any(Object));
        expect(applyConfigSpy).toHaveBeenCalledWith(mockInstance, testSoundMap['simple_sound']);
        expect(mockBusSystem.routeInstance).toHaveBeenCalledWith(mockInstance, 'sfx');
    });

    it('should handle layered sounds correctly', () => {
        mockController.play
            .mockReturnValueOnce({ playbackId: 1, instance: mockInstance })
            .mockReturnValueOnce({ playbackId: 2, instance: mockInstance });

        const result = router.play('layer_sound');

        expect(result).toEqual([1, 2]);
        expect(mockController.play).toHaveBeenCalledTimes(2);
    });

    it('should handle container sounds and delegate to ContainerManager', () => {
        const result = router.play('container_sound');

        expect(result).toBe(1);
        expect(mockContainerManager.getNextSource).toHaveBeenCalledWith(
            'container_sound',
            testSoundMap['container_sound']
        );
        expect(mockController.play).toHaveBeenCalledWith('var2.wav', expect.any(Object));
    });

    it('should reject to plain soundController.play if config is not found', () => {
        const result = router.play('unknown_sound', { rate: 1.5 });

        expect(result).toBe(null);
        expect(mockController.play).not.toHaveBeenCalled();
        expect(mockBusSystem.routeInstance).not.toHaveBeenCalled();
    });

    describe('Playback Control (stop)', () => {
        it('should delegate stop to SoundController by string (soundId)', () => {
            router.stop('bg_music');
            expect(mockController.stopAll).toHaveBeenCalledWith('bg_music');
        });

        it('should delegate stop to SoundController by number (playbackId)', () => {
            router.stop(42);
            expect(mockController.stopById).toHaveBeenCalledWith(42);
            expect(mockController.stopAll).not.toHaveBeenCalled();
        });

        it('should delegate stop to SoundController by array of numbers (playbackIds)', () => {
            router.stop([10, 11, 12]);
            expect(mockController.stopById).toHaveBeenCalledTimes(3);
            expect(mockController.stopById).toHaveBeenNthCalledWith(1, 10);
            expect(mockController.stopById).toHaveBeenNthCalledWith(3, 12);
        });
    });

    describe('onRevive Hook Generation', () => {
        it('should pass an onRevive hook that correctly applies configuration', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToInstance');

            let capturedOptions: any;
            mockController.play.mockImplementation((id: any, options: any) => {
                capturedOptions = options;
                return { playbackId: 99, instance: mockInstance };
            });

            router.play('simple_sound');

            expect(capturedOptions.onRevive).toBeDefined();
            expect(typeof capturedOptions.onRevive).toBe('function');

            capturedOptions.onRevive(mockInstance);
            expect(applyConfigSpy).toHaveBeenCalledWith(mockInstance, testSoundMap['simple_sound']);
        });
    });

    describe('Playback Edge Cases (play method)', () => {
        it('should return null if soundController.play returns null for a standard sound', () => {
            mockController.play = vi.fn().mockReturnValue(null);
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToInstance');

            const result = router.play('simple_sound');

            expect(result).toBeNull();
            expect(mockController.play).toHaveBeenCalled();
            expect(applyConfigSpy).not.toHaveBeenCalled();
        });
    });

    describe('Container Sounds Edge Cases (handleContainer)', () => {
        it('should return null if soundController.play fails for a container source', () => {
            mockContainerManager.getNextSource.mockReturnValue('some_internal_sound');
            mockController.play = vi.fn().mockReturnValue(null);

            const result = router.play('container_sound');

            expect(result).toBeNull();
            expect(mockController.play).toHaveBeenCalledWith('some_internal_sound', expect.any(Object));
        });

        it('should pass a working onRevive hook to the container instance', () => {
            mockContainerManager.getNextSource.mockReturnValue('some_internal_sound');
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToInstance').mockImplementation(() => {});

            let capturedOptions: any;
            mockController.play = vi.fn().mockImplementation((name, options) => {
                capturedOptions = options;
                return { playbackId: 99, instance: mockInstance };
            });

            router.play('container_sound');

            expect(typeof capturedOptions.onRevive).toBe('function');

            const fakeRevivedInstance = {} as any;
            capturedOptions.onRevive(fakeRevivedInstance);

            expect(applyConfigSpy).toHaveBeenCalledWith(fakeRevivedInstance, testSoundMap['container_sound']);
        });
    });

    describe('Layered Sounds Edge Cases (handleLayering)', () => {
        it('should skip a layer and continue if soundController.play returns null for that specific layer', () => {
            mockController.play = vi
                .fn()
                .mockReturnValueOnce({ playbackId: 10, instance: mockInstance })
                .mockReturnValueOnce(null);

            const result = router.play('layer_sound');

            expect(result).toEqual([10]);
            expect(mockController.play).toHaveBeenCalledTimes(2);
        });

        it('should pass a working onRevive hook to layered instances', () => {
            const applyConfigSpy = vi.spyOn(router, 'applyConfigToInstance').mockImplementation(() => {});

            const capturedOptions: any[] = [];
            mockController.play = vi.fn().mockImplementation((name, options) => {
                capturedOptions.push(options);
                return { playbackId: 1, instance: mockInstance };
            });

            router.play('layer_sound');

            const firstLayerOptions = capturedOptions[0];
            expect(typeof firstLayerOptions.onRevive).toBe('function');

            const fakeRevivedInstance = {} as any;
            firstLayerOptions.onRevive(fakeRevivedInstance);

            expect(applyConfigSpy).toHaveBeenCalledWith(fakeRevivedInstance, testSoundMap['layer_sound']);
        });

        it('should return null if ALL layers fail to play', () => {
            mockController.play = vi.fn().mockReturnValue(null);

            const result = router.play('layer_sound');

            expect(result).toBeNull();
        });
    });

    describe('applyConfigToInstance (Ducking & RTPC)', () => {
        it('should trigger ducking and bind RTPC if present in config', () => {
            const complexConfig: any = {
                busId: 'sfx',
                ducking: { target: 'music', intensity: 0.8 },
                rtpc: { gain: { gameParam: 'speed', curve: [] } }
            };

            router.applyConfigToInstance(mockInstance, complexConfig);

            expect(mockDuckingManager.triggerDucking).toHaveBeenCalledWith(mockInstance, 'music', 0.8);
            expect(InstanceRTPCBinder.bind).toHaveBeenCalledWith(mockInstance, complexConfig.rtpc, mockRtpcManager);
        });

        it('should use default ducking intensity (1) if not provided', () => {
            const defaultDuckingConfig: any = {
                busId: 'sfx',
                ducking: { target: 'ambient' }
            };

            router.applyConfigToInstance(mockInstance, defaultDuckingConfig);

            expect(mockDuckingManager.triggerDucking).toHaveBeenCalledWith(mockInstance, 'ambient', 1);
        });
    });

    describe('applyVariation (Volume & Offset)', () => {
        it('should apply volumeVar and randomOffset variations correctly', () => {
            testSoundMap['var_sound'] = {
                busId: 'sfx',
                variation: { volumeVar: 0.2, randomOffset: 500 }
            };

            const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(1);

            router.play('var_sound', { volume: 0.5 });

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
