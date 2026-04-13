import { describe, it, expect, vi, beforeEach } from 'vitest';

import { InstanceRTPCBinder } from '@domain/Managers/InstanceRTPCBinder.js';

import type { IRTPCConfig, RTPCTargetProperty } from '@domain/Configuration/Ports/IRTPCConfig.js';
import type { IRTPCAdapter } from '@domain/Managers/Ports/IRTPCAdapter.js';
import type { ISoundController } from '@domain/Shared/Ports/ISoundController.js';
import type { PlaybackId } from '@domain/Types/Branded.js';
import type { Mocked } from 'vitest';

describe('InstanceRTPCBinder', () => {
    let mockRtpcAdapter: Mocked<IRTPCAdapter>;
    let mockSoundController: Mocked<ISoundController>;
    let capturedCleanupCallback: (() => void) | null;

    const testPlaybackId = 123 as PlaybackId;

    beforeEach(() => {
        vi.clearAllMocks();
        capturedCleanupCallback = null;

        mockRtpcAdapter = {
            getValue: vi.fn().mockReturnValue(0),
            on: vi.fn(),
            off: vi.fn()
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
                capturedCleanupCallback = callback;
                return vi.fn();
            })
        } as unknown as Mocked<ISoundController>;
    });

    it('should bind RTPC config to playback ID and apply initial values via SoundController', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            gain: {
                gameParam: 'car_speed',
                curve: [
                    { x: 0, y: 0.5 },
                    { x: 100, y: 1 }
                ],
                smoothingMs: 100
            }
        };

        mockRtpcAdapter.getValue.mockReturnValue(50);

        InstanceRTPCBinder.bind(testPlaybackId, configs, mockRtpcAdapter, mockSoundController);

        expect(mockRtpcAdapter.on).toHaveBeenCalledWith('car_speed', expect.any(Function));

        expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(testPlaybackId, 'gain', 0.75, 100);
    });

    it('should ignore unsupported targets like sendLevel', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            sendLevel: {
                gameParam: 'reverb_amount',
                curve: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 }
                ]
            }
        };

        InstanceRTPCBinder.bind(testPlaybackId, configs, mockRtpcAdapter, mockSoundController);

        expect(mockRtpcAdapter.on).not.toHaveBeenCalled();
        expect(mockSoundController.fadeParameter).not.toHaveBeenCalled();
    });

    it('should clean up RTPC subscriptions when voice ends via SoundController', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            pitch: {
                gameParam: 'engine_rpm',
                curve: [
                    { x: 1000, y: 1 },
                    { x: 8000, y: 2 }
                ]
            }
        };

        InstanceRTPCBinder.bind(testPlaybackId, configs, mockRtpcAdapter, mockSoundController);

        expect(mockRtpcAdapter.on).toHaveBeenCalledWith('engine_rpm', expect.any(Function));

        expect(mockSoundController.onVoiceEnded).toHaveBeenCalledWith(testPlaybackId, expect.any(Function));
        expect(capturedCleanupCallback).toBeDefined();

        capturedCleanupCallback!();

        expect(mockRtpcAdapter.off).toHaveBeenCalledWith('engine_rpm', expect.any(Function));
    });

    it('should prevent reacting to RTPC events after cleanup (Race Condition prevention)', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            filterFrequency: {
                gameParam: 'underwater',
                curve: [
                    { x: 0, y: 22_000 },
                    { x: 1, y: 500 }
                ]
            }
        };

        InstanceRTPCBinder.bind(testPlaybackId, configs, mockRtpcAdapter, mockSoundController);

        const rtpcHandler = mockRtpcAdapter.on.mock.calls[0][1];

        capturedCleanupCallback!();

        mockSoundController.fadeParameter.mockClear();

        rtpcHandler(1);

        expect(mockSoundController.fadeParameter).not.toHaveBeenCalled();
    });

    it('should support preset curve configurations (MathCurvePresetDef)', () => {
        const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
            gain: {
                gameParam: 'car_speed',
                curve: {
                    type: 'exponential',
                    minX: 0,
                    maxX: 100,
                    minY: 0,
                    maxY: 1
                },
                smoothingMs: 150
            }
        };

        mockRtpcAdapter.getValue.mockReturnValue(50);

        InstanceRTPCBinder.bind(testPlaybackId, configs, mockRtpcAdapter, mockSoundController);

        expect(mockRtpcAdapter.on).toHaveBeenCalledWith('car_speed', expect.any(Function));
        expect(mockSoundController.fadeParameter).toHaveBeenCalledWith(testPlaybackId, 'gain', 0.25, 150);
    });

    describe('Missing Coverage & Guard Clauses (Early Returns & Continues)', () => {
        it('should early return if configs object is undefined', () => {
            InstanceRTPCBinder.bind(testPlaybackId, undefined, mockRtpcAdapter, mockSoundController);

            expect(mockRtpcAdapter.on).not.toHaveBeenCalled();
            expect(mockSoundController.onVoiceEnded).not.toHaveBeenCalled();
        });

        it('should continue loop if a specific config property is undefined', () => {
            const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
                gain: undefined as any,
                pitch: {
                    gameParam: 'engine',
                    curve: [
                        { x: 0, y: 0 },
                        { x: 1, y: 1 }
                    ],
                    smoothingMs: 50
                }
            };

            InstanceRTPCBinder.bind(testPlaybackId, configs, mockRtpcAdapter, mockSoundController);

            expect(mockRtpcAdapter.on).toHaveBeenCalledTimes(1);
            expect(mockRtpcAdapter.on).toHaveBeenCalledWith('engine', expect.any(Function));
        });

        it('should early return without registering cleanup if no valid subscriptions were made', () => {
            InstanceRTPCBinder.bind(testPlaybackId, {}, mockRtpcAdapter, mockSoundController);
            expect(mockSoundController.onVoiceEnded).not.toHaveBeenCalled();

            const unsupportedConfigs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
                sendLevel: { gameParam: 'verb', curve: [] }
            };
            InstanceRTPCBinder.bind(testPlaybackId, unsupportedConfigs, mockRtpcAdapter, mockSoundController);

            expect(mockSoundController.onVoiceEnded).not.toHaveBeenCalled();
        });

        it('should early return in cleanup if already cleaned up (Idempotency)', () => {
            const configs: Partial<Record<RTPCTargetProperty, IRTPCConfig>> = {
                gain: { gameParam: 'speed', curve: [] }
            };

            InstanceRTPCBinder.bind(testPlaybackId, configs, mockRtpcAdapter, mockSoundController);

            expect(capturedCleanupCallback).toBeDefined();

            capturedCleanupCallback!();
            expect(mockRtpcAdapter.off).toHaveBeenCalledTimes(1);

            capturedCleanupCallback!();

            expect(mockRtpcAdapter.off).toHaveBeenCalledTimes(1);
        });
    });
});
