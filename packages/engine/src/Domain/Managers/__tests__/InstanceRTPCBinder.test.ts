// noinspection D

import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { GameParamId, Milliseconds, PlaybackId } from '@scene-grid/shared';
import type { Mocked } from 'vitest';

import { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('InstanceRTPCBinder (Data-Oriented Polling)', () => {
    let mockRtpcAdapter: Mocked<IRTPCAdapter>;
    let mockSoundController: Mocked<ISoundController>;
    let capturedCleanupCallbacks: Map<PlaybackId, () => void>;
    let binder: InstanceRTPCBinder;

    const testPlaybackId = 123 as PlaybackId;
    const anotherPlaybackId = 456 as PlaybackId;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedCleanupCallbacks = new Map();

        mockRtpcAdapter = {
            getValue: vi.fn().mockReturnValue(0),
            setValue: vi.fn().mockReturnValue(0)
        };

        mockSoundController = {
            play: vi.fn(),
            stopById: vi.fn(),
            stopAll: vi.fn(),
            setVolume: vi.fn(),
            fadeVolume: vi.fn(),
            fadeParameter: vi.fn(),
            getCurrentTime: vi.fn(),
            getSampleRate: vi.fn(),
            cancelScheduled: vi.fn(),
            getActivePlaybacks: vi.fn(),
            getSoundId: vi.fn(),
            getPlaybackState: vi.fn(),
            virtualize: vi.fn(),
            devirtualize: vi.fn(),
            onVoiceEnded: vi.fn().mockImplementation((id, callback) => {
                capturedCleanupCallbacks.set(id, callback);
                return vi.fn();
            })
        } as unknown as Mocked<ISoundController>;

        binder = new InstanceRTPCBinder(mockRtpcAdapter, mockSoundController);
    });

    it('should bind configs, apply initial values, and register cleanup', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            gain: {
                gameParam: 'car_speed' as GameParamId,
                curve: [
                    { x: 0, y: 0.5 },
                    { x: 100, y: 1 }
                ],
                smoothing: 100 as Milliseconds
            }
        };

        mockRtpcAdapter.getValue.mockReturnValue(50);

        binder.bind(testPlaybackId, configs);

        expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(testPlaybackId, 'gain', 0.75, 100);
        expect(mockSoundController.onVoiceEnded).toHaveBeenCalledWith(testPlaybackId, expect.any(Function));
    });

    it('should evaluate all bindings during tickRTPC()', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            pitch: {
                gameParam: 'engine_rpm' as GameParamId,
                curve: [
                    { x: 1000, y: 1 },
                    { x: 8000, y: 2 }
                ],
                smoothing: 50 as Milliseconds
            }
        };

        binder.bind(testPlaybackId, configs);
        mockSoundController.fadeParameter.mockClear();

        mockRtpcAdapter.getValue.mockReturnValue(4500);
        binder.tickRTPC();

        expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(testPlaybackId, 'pitch', 1.5, 50);
    });

    it('should completely remove bindings using swap-and-pop on voice ended', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            filterFrequency: {
                gameParam: 'depth' as GameParamId,
                curve: [
                    { x: 0, y: 20000 },
                    { x: 100, y: 500 }
                ]
            }
        };

        binder.bind(testPlaybackId, configs);
        binder.bind(anotherPlaybackId, configs);
        mockSoundController.fadeParameter.mockClear();

        const cleanupTestVoice = capturedCleanupCallbacks.get(testPlaybackId);
        expect(cleanupTestVoice).toBeDefined();
        cleanupTestVoice!();

        binder.tickRTPC();

        expect(mockSoundController.fadeParameter).not.toHaveBeenCalledWith(
            testPlaybackId,
            expect.anything(),
            expect.anything(),
            expect.anything()
        );
        expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(
            anotherPlaybackId,
            'filterFrequency',
            expect.any(Number),
            50
        );
    });

    it('should correctly handle preset curve configurations', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            gain: {
                gameParam: 'car_speed' as GameParamId,
                curve: {
                    type: 'exponential',
                    minX: 0,
                    maxX: 100,
                    minY: 0,
                    maxY: 1
                },
                smoothing: 150 as Milliseconds
            }
        };

        mockRtpcAdapter.getValue.mockReturnValue(50);
        binder.bind(testPlaybackId, configs);

        expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(testPlaybackId, 'gain', 0.25, 150);
    });

    describe('Guard Clauses & Edge Cases', () => {
        it('should early return if configs object is absent', () => {
            binder.bind(testPlaybackId, undefined);
            expect(mockSoundController.onVoiceEnded).not.toHaveBeenCalled();
        });

        it('should ignore unsupported targets like sendLevel', () => {
            const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
                sendLevel: {
                    gameParam: 'reverb_amount' as GameParamId,
                    curve: [
                        { x: 0, y: 0 },
                        { x: 1, y: 1 }
                    ]
                }
            };

            binder.bind(testPlaybackId, configs);

            expect(mockSoundController.fadeParameter).not.toHaveBeenCalled();
            expect(mockSoundController.onVoiceEnded).not.toHaveBeenCalled();
        });

        it('should continue loop if a specific config property is absent', () => {
            const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
                gain: undefined,
                pitch: {
                    gameParam: 'engine' as GameParamId,
                    curve: [
                        { x: 0, y: 0 },
                        { x: 1, y: 1 }
                    ],
                    smoothing: 50 as Milliseconds
                }
            };

            binder.bind(testPlaybackId, configs);

            expect(mockSoundController.fadeParameter).toHaveBeenCalledTimes(1);
            expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(testPlaybackId, 'pitch', 0, 50);
        });

        it('should not register cleanup if no valid bindings were added', () => {
            binder.bind(testPlaybackId, {});
            expect(mockSoundController.onVoiceEnded).not.toHaveBeenCalled();
        });

        it('should safely unbind even if playbackId is not found (Idempotency)', () => {
            binder.bind(testPlaybackId, { gain: { gameParam: 'p1' as GameParamId, curve: [] } });

            const cleanup = capturedCleanupCallbacks.get(testPlaybackId);

            cleanup!();

            expect(() => {
                cleanup!();
            }).not.toThrow();

            expect(() => {
                binder.tickRTPC();
            }).not.toThrow();
        });
    });

    describe('Complex Engine Scenarios & DOD Array Mechanics', () => {
        it('should handle multiple RTPC targets for a single voice simultaneously', () => {
            const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
                gain: {
                    gameParam: 'distance' as GameParamId,
                    curve: [
                        { x: 0, y: 1 },
                        { x: 100, y: 0 }
                    ],
                    smoothing: 50 as Milliseconds
                },
                pitch: {
                    gameParam: 'speed' as GameParamId,
                    curve: [
                        { x: 0, y: 1 },
                        { x: 100, y: 2 }
                    ],
                    smoothing: 20 as Milliseconds
                },
                filterFrequency: {
                    gameParam: 'underwater' as GameParamId,
                    curve: [
                        { x: 0, y: 22000 },
                        { x: 1, y: 500 }
                    ],
                    smoothing: 100 as Milliseconds
                }
            };

            binder.bind(testPlaybackId, configs);
            mockSoundController.fadeParameter.mockClear();

            mockRtpcAdapter.getValue.mockImplementation(paramId => {
                if (paramId === 'distance') return 50;
                if (paramId === 'speed') return 100;
                if (paramId === 'underwater') return 1;
                return 0;
            });

            binder.tickRTPC();

            expect(mockSoundController.fadeParameter).toHaveBeenCalledTimes(3);
            expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(testPlaybackId, 'gain', 0.5, 50);
            expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(testPlaybackId, 'pitch', 2, 20);
            expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(testPlaybackId, 'filterFrequency', 500, 100);
        });

        it('should perfectly execute swap-and-pop logic without shifting bugs (Stress Test)', () => {
            const configs = { gain: { gameParam: 'p1' as GameParamId, curve: [] } };
            const voiceA = 1001 as PlaybackId;
            const voiceB = 1002 as PlaybackId;
            const voiceC = 1003 as PlaybackId;

            binder.bind(voiceA, configs);
            binder.bind(voiceB, configs);
            binder.bind(voiceC, configs);

            mockSoundController.fadeParameter.mockClear();
            capturedCleanupCallbacks.get(voiceB)!();
            binder.tickRTPC();

            expect(mockSoundController.fadeParameter).not.toHaveBeenCalledWith(
                voiceB,
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
            expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(voiceA, 'gain', expect.any(Number), 50);
            expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(voiceC, 'gain', expect.any(Number), 50);

            mockSoundController.fadeParameter.mockClear();

            capturedCleanupCallbacks.get(voiceC)!();
            binder.tickRTPC();

            expect(mockSoundController.fadeParameter).not.toHaveBeenCalledWith(
                voiceC,
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
            expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(voiceA, 'gain', expect.any(Number), 50);

            mockSoundController.fadeParameter.mockClear();

            capturedCleanupCallbacks.get(voiceA)!();
            binder.tickRTPC();

            expect(mockSoundController.fadeParameter).not.toHaveBeenCalled();
        });

        it('should correctly remove ALL bindings for a single voice if it has multiple targets', () => {
            const multiConfigs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
                gain: { gameParam: 'p1' as GameParamId, curve: [] },
                pitch: { gameParam: 'p2' as GameParamId, curve: [] }
            };

            const otherConfigs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
                gain: { gameParam: 'p3' as GameParamId, curve: [] }
            };

            binder.bind(testPlaybackId, multiConfigs);
            binder.bind(anotherPlaybackId, otherConfigs);

            capturedCleanupCallbacks.get(testPlaybackId)!();

            mockSoundController.fadeParameter.mockClear();
            binder.tickRTPC();

            expect(mockSoundController.fadeParameter).not.toHaveBeenCalledWith(
                testPlaybackId,
                expect.anything(),
                expect.anything(),
                expect.anything()
            );
            expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(
                anotherPlaybackId,
                'gain',
                expect.any(Number),
                50
            );
        });

        it('should handle extreme edge cases: calling onVoiceEnded during a tick loop', () => {
            binder.bind(testPlaybackId, { gain: { gameParam: 'p1' as GameParamId, curve: [] } });
            binder.bind(anotherPlaybackId, { pitch: { gameParam: 'p2' as GameParamId, curve: [] } });

            mockSoundController.fadeParameter.mockImplementationOnce(id => {
                if (id === testPlaybackId) {
                    capturedCleanupCallbacks.get(testPlaybackId)!();
                }
            });

            expect(() => {
                binder.tickRTPC();
            }).not.toThrow();
        });
    });
});
