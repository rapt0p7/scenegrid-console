import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SoundController } from '@infrastructure/loader/SoundController.js';

import type { PlaybackId, SoundId } from '@domain/Types/Branded.js';
import type { PlaybackScheduler, AutomationEngine, AudioCtx } from '@infrastructure';
import type SoundPoolManager from '@infrastructure/instance/SoundPoolManager.js';

describe('SoundController', () => {
    let mockPool: any;
    let mockScheduler: any;
    let mockContext: any;
    let mockAutomation: any;
    let controller: SoundController;
    let fakeBuffer: AudioBuffer;
    let fakeInstance: any;

    beforeEach(() => {
        vi.clearAllMocks();

        fakeBuffer = {} as AudioBuffer;

        fakeInstance = {
            setLoop: vi.fn(),
            setRate: vi.fn(),
            stop: vi.fn(),
            setPosition: vi.fn(),
            cancelScheduled: vi.fn(),
            on: vi.fn().mockReturnValue(() => 'unsubscribed'),
            instanceGain: {
                gain: {}
            }
        };

        mockPool = {
            acquire: vi.fn().mockReturnValue(fakeInstance),
            dispose: vi.fn()
        } as unknown as SoundPoolManager;

        mockScheduler = {
            schedulePlay: vi.fn()
        } as unknown as PlaybackScheduler;

        mockContext = {
            currentTime: 123.45,
            sampleRate: 48_000
        } as unknown as AudioCtx;

        mockAutomation = {
            set: vi.fn(),
            ramp: vi.fn()
        } as unknown as AutomationEngine;

        controller = new SoundController(mockPool, mockScheduler, mockContext, mockAutomation);
    });

    describe('Registration', () => {
        it('should register a new sound with default options', () => {
            controller.register('sound_1' as SoundId, fakeBuffer);

            const registry = (controller as any).registry;
            expect(registry.has('sound_1')).toBe(true);
            expect(registry.get('sound_1').options).toEqual({ url: '' });
        });

        it('should register a new sound with custom options', () => {
            controller.register('sound_2' as SoundId, fakeBuffer, { url: 'path/to/sound.wav' });

            expect((controller as any).registry.get('sound_2').options).toEqual({ url: 'path/to/sound.wav' });
        });

        it('should throw an error if registering an already existing sound', () => {
            controller.register('duplicate_sound' as SoundId, fakeBuffer);

            expect(() => {
                controller.register('duplicate_sound' as SoundId, fakeBuffer);
            }).toThrow('already registered');
        });
    });

    describe('Unregistration', () => {
        it('should remove sound from registry and dispose from pool', () => {
            controller.register('sound_to_remove' as SoundId, fakeBuffer);
            controller.unregister('sound_to_remove' as SoundId);

            expect((controller as any).registry.has('sound_to_remove')).toBe(false);
            expect(mockPool.dispose).toHaveBeenCalledWith('sound_to_remove');
        });
    });

    describe('Playback', () => {
        it('should return null if playing an unregistered sound', () => {
            const result = controller.play('unknown_sound' as SoundId, {});
            expect(result).toBeNull();
        });

        it('should return null if pool fails to acquire an instance (e.g., voice limit reached)', () => {
            controller.register('sound_limit' as SoundId, fakeBuffer);
            mockPool.acquire.mockReturnValueOnce(null);

            const result = controller.play('sound_limit' as SoundId, {});

            expect(result).toBeNull();
            expect(mockScheduler.schedulePlay).not.toHaveBeenCalled();
        });

        it('should acquire instance, schedule play, and return JUST the PlaybackId', () => {
            controller.register('hero_jump' as SoundId, fakeBuffer);

            const playbackId = controller.play('hero_jump' as SoundId, {
                when: 0.5,
                offset: 1.2,
                duration: 2,
                loop: true,
                rate: 1.5
            });

            expect(mockPool.acquire).toHaveBeenCalledWith('hero_jump');
            expect(fakeInstance.setLoop).toHaveBeenCalledWith(true);
            expect(fakeInstance.setRate).toHaveBeenCalledWith(1.5);
            expect(mockScheduler.schedulePlay).toHaveBeenCalledWith(fakeInstance, 0.5, 1.2, 2);

            expect(typeof playbackId).toBe('number');
        });

        it('should skip playback if cooldown is set and did not pass', () => {
            controller.register('sound_limit' as SoundId, fakeBuffer, { url: 'path/to/sound.wav', cooldownMs: 30 });

            const id1 = controller.play('sound_limit' as SoundId, {});
            const id2 = controller.play('sound_limit' as SoundId, {});

            expect(typeof id1).toBe('number');
            expect(id2).toBeNull();
            expect(mockScheduler.schedulePlay).toHaveBeenCalledTimes(1);
        });
    });

    describe('Adapter Boundaries (onRevive Wrapper)', () => {
        it('should translate ISoundInstance to PlaybackId for the Domain layer', () => {
            controller.register('test_sound' as SoundId, fakeBuffer);
            const mockDomainRevive = vi.fn();

            const playbackId = controller.play('test_sound' as SoundId, { onRevive: mockDomainRevive });
            expect(playbackId).not.toBeNull();

            const voice = controller.getLogicalVoice(playbackId!);
            expect(voice).toBeDefined();
            expect(voice?.onRevive).toBeDefined();

            voice!.onRevive!(fakeInstance);

            expect(mockDomainRevive).toHaveBeenCalledTimes(1);
            expect(mockDomainRevive).toHaveBeenCalledWith(playbackId);
            expect(mockDomainRevive).not.toHaveBeenCalledWith(fakeInstance);
        });
    });

    describe('Stopping & Resource Management', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, fakeBuffer);
            controller.register('other_sound' as SoundId, fakeBuffer);
            vi.mocked(mockPool.acquire).mockReturnValue(fakeInstance);
        });

        it('should stop a specific physical instance by playbackId (with optional time)', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            expect(controller.activeVoices.has(id)).toBe(true);

            controller.stopById(id, 1.5);

            expect(fakeInstance.stop).toHaveBeenCalledWith(1.5);
            expect(controller.activeVoices.has(id)).toBe(false);
        });

        it('should call pool.dispose to stop all instances of a specific sound', () => {
            controller.stopAll('bgm_music' as SoundId);
            expect(mockPool.dispose).toHaveBeenCalledWith('bgm_music');
        });

        it('should clear ALL sounds from activeVoices when stopAll is called without arguments', () => {
            controller.play('test_sound' as SoundId, {});
            controller.play('other_sound' as SoundId, {});
            controller.stopAll();
            expect(controller.activeVoices.size).toBe(0);
        });

        it('should cancel scheduled events on physical instance', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            controller.cancelScheduled(id);
            expect(fakeInstance.cancelScheduled).toHaveBeenCalled();
        });
    });

    describe('Automation & Hardware Control', () => {
        let playbackId: PlaybackId;

        beforeEach(() => {
            controller.register('test_sound' as SoundId, fakeBuffer);
            playbackId = controller.play('test_sound' as SoundId, {}) as PlaybackId;
        });

        it('should delegate setVolume to AutomationEngine', () => {
            controller.setVolume(playbackId, 0.75);
            expect(mockAutomation.set).toHaveBeenCalledWith(fakeInstance.instanceGain.gain, 0.75);
        });

        it('should delegate fadeVolume to AutomationEngine with correct parameters', () => {
            controller.fadeVolume(playbackId, 0.2, 500, 'equal-power', 100);
            expect(mockAutomation.ramp).toHaveBeenCalledWith(
                fakeInstance.instanceGain.gain,
                0.2,
                500,
                'equal-power',
                100
            );
        });

        it('should return context time and sample rate', () => {
            expect(controller.getCurrentTime()).toBe(123.45);
            expect(controller.getSampleRate()).toBe(48_000);
        });

        it('should delegate onVoiceEnded to instance event emitter', () => {
            const mockCallback = vi.fn();
            const unsub = controller.onVoiceEnded(playbackId, mockCallback);

            expect(fakeInstance.on).toHaveBeenCalledWith('ended', mockCallback);
            expect(unsub()).toBe('unsubscribed');
        });
    });

    describe('Logical Voices Position', () => {
        beforeEach(() => {
            controller.register('test_sound' as SoundId, fakeBuffer);
            vi.mocked(mockPool.acquire).mockReturnValue(fakeInstance);
        });

        it('should update logical position and physical instance position', () => {
            const id = controller.play('test_sound' as SoundId, {})!;
            controller.setPosition(id, 10, 20, 30);

            const voice = controller.getLogicalVoice(id);
            expect(voice?.position).toEqual({ x: 10, y: 20, z: 30 });
            expect(fakeInstance.setPosition).toHaveBeenCalledWith(10, 20, 30);
        });
    });
});
